#!/usr/bin/env python3
"""Bundle Eko at Dusk into one HTML file that opens straight from disk.

    python tools/build_single.py              # writes dist/eko-at-dusk.html
    python tools/build_single.py --no-strip   # keep comments and indentation

Each module in src/ is wrapped in its own function scope and evaluated in the
order the browser would load it, so no names change. main.js stays at the top
level because it uses top-level await. three.js still loads from the CDN
through the import map in index.html. If Node.js is on the PATH, the bundle is
syntax-checked before it is written.
"""
import argparse
import gzip
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
ENTRY = 'main.js'
SCRIPT_TAG = '<script type="module" src="src/main.js"></script>'

NAME = r'[A-Za-z_$][\w$]*'
IMPORT_RE = re.compile(r"^import\s+(.+?)\s+from\s+'([^']+)';?\s*$")


def fail(msg):
    sys.exit(f'build_single: {msg}')


def parse_clause(clause, where):
    """'* as X' -> ('ns', 'X'); '{ a, b as c }' -> ('named', [('a', 'a'), ('b', 'c')])."""
    m = re.fullmatch(rf'\*\s+as\s+({NAME})', clause)
    if m:
        return 'ns', m.group(1)
    m = re.fullmatch(r'\{(.*)\}', clause)
    if not m:
        fail(f'{where}: unsupported import form: {clause}')
    pairs = []
    for part in filter(None, (p.strip() for p in m.group(1).split(','))):
        pm = re.fullmatch(rf'({NAME})(?:\s+as\s+({NAME}))?', part)
        if not pm:
            fail(f'{where}: cannot read import specifier: {part}')
        pairs.append((pm.group(1), pm.group(2) or pm.group(1)))
    return 'named', pairs


def declared_names(line, where):
    """Names declared by a line that started with 'export ' (already removed)."""
    m = re.match(rf'(?:async\s+)?function\s*\*?\s*({NAME})|class\s+({NAME})', line)
    if m:
        return [m.group(1) or m.group(2)]
    m = re.match(r'(?:const|let|var)\s+', line)
    if not m:
        fail(f'{where}: cannot read export: {line.strip()}')
    # Split the declarators on this line at top-level commas: "a = 1, b = f(x, y)".
    # A declaration that opens a block ("S = {") never returns to depth 0 on
    # this line, so the last segment is read once the line ends.
    names, depth, segs, seg = [], 0, [], ''
    for ch in line[m.end():]:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        if ch == ',' and depth == 0:
            segs.append(seg)
            seg = ''
        else:
            seg += ch
    for s in segs + [seg]:
        dm = re.match(rf'\s*({NAME})\s*=(?![=>])', s)
        if dm:
            names.append(dm.group(1))
    if not names:
        fail(f'{where}: cannot read export: {line.strip()}')
    return names


class Module:
    def __init__(self, name):
        self.name = name
        self.var = '__m_' + re.sub(r'\W', '_', name[:-3])
        self.imports = []  # (spec, kind, value)
        self.exports = []
        body = []
        for n, line in enumerate((SRC / name).read_text(encoding='utf-8').splitlines(), 1):
            where = f'src/{name}:{n}'
            m = IMPORT_RE.match(line)
            if m:
                self.imports.append((m.group(2), *parse_clause(m.group(1).strip(), where)))
                continue
            if re.match(r'\s*import\b(?!\s*\()', line):
                fail(f'{where}: imports must fit on one line')
            if re.match(r'\s+export\b', line):
                fail(f'{where}: exports must start at column 0')
            if line.startswith('export '):
                line = line[len('export '):]
                if line.startswith(('default', '{', '*')):
                    fail(f'{where}: unsupported export form')
                self.exports += declared_names(line, where)
            body.append(line)
        self.body = '\n'.join(body)

    def local_deps(self):
        return [spec[2:] for spec, _, _ in self.imports if spec.startswith('./')]


def load_graph():
    """Modules in the order the browser evaluates them (depth-first, post-order)."""
    mods, order, active = {}, [], []

    def visit(name):
        if name in active:
            fail('circular import: ' + ' -> '.join(active[active.index(name):] + [name]))
        if name in mods:
            return
        if not (SRC / name).is_file():
            fail(f'missing module src/{name}')
        active.append(name)
        mods[name] = mod = Module(name)
        for dep in mod.local_deps():
            visit(dep)
        active.pop()
        order.append(mod)

    visit(ENTRY)
    return mods, order


def bundle(mods, order):
    bare = {}  # spec -> {'ns': local or None, 'named': {local: imported}}
    taken = {}  # local name -> spec, for hoisted imports
    for mod in order:
        for spec, kind, value in mod.imports:
            if spec.startswith('./'):
                continue
            entry = bare.setdefault(spec, {'ns': None, 'named': {}})
            pairs = [(None, value)] if kind == 'ns' else value
            for imported, local in pairs:
                if taken.setdefault(local, spec) != spec:
                    fail(f'src/{mod.name}: "{local}" is imported from two different places')
                if kind == 'ns':
                    entry['ns'] = local
                elif entry['named'].setdefault(local, imported) != imported:
                    fail(f'src/{mod.name}: "{local}" means two different imports from {spec}')

    out = []
    for spec, entry in bare.items():
        if entry['ns']:
            out.append(f"import * as {entry['ns']} from '{spec}';")
        if entry['named']:
            names = ', '.join(i if i == l else f'{i} as {l}' for l, i in entry['named'].items())
            out.append(f"import {{ {names} }} from '{spec}';")

    for mod in order:
        lines = []
        for spec, kind, value in mod.imports:
            if not spec.startswith('./'):
                continue
            dep = mods[spec[2:]]
            if kind == 'ns':
                lines.append(f'const {value} = {dep.var};')
                continue
            for imported, _ in value:
                if imported not in dep.exports:
                    fail(f'src/{mod.name} imports "{imported}", which src/{dep.name} does not export')
            names = ', '.join(i if i == l else f'{i}: {l}' for i, l in value)
            lines.append(f'const {{ {names} }} = {dep.var};')
        lines.append(mod.body)
        code = '\n'.join(lines)
        out.append(f'// ---- src/{mod.name}')
        if mod.name == ENTRY:
            out.append(code)
        else:
            out.append(f'const {mod.var} = (() => {{\n{code}\nreturn {{ {", ".join(mod.exports)} }};\n}})();')
    return '\n'.join(out) + '\n'


KEYWORDS = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void',
            'throw', 'instanceof', 'yield', 'await'}
REGEX_AFTER = set('(,=:[!&|?{};+-*%<>~^') | KEYWORDS | {''}


def strip_js(src):
    """Drop comments and indentation; keep every line break that code relies on.

    A small lexer tracks strings, template literals (with nested ${...}) and
    regex literals so that '//' inside them is never mistaken for a comment.
    All multi-line template literals in this project are GLSL, so blank lines
    and whole-line '//' comments inside them are dropped too.
    """
    out, i, n = [], 0, len(src)
    modes = [['code', 0]]  # code frames carry their brace depth
    last = ''
    while i < n:
        c = src[i]
        if modes[-1][0] == 'tpl':
            if c == '\\':
                out.append(src[i:i + 2])
                i += 2
            elif c == '`':
                out.append(c)
                modes.pop()
                i += 1
                last = 'a'
            elif src.startswith('${', i):
                out.append('${')
                modes.append(['code', 0])
                i += 2
                last = '{'
            else:
                out.append(c)
                i += 1
            continue
        if src.startswith('//', i):
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            if j < 0:
                fail('unterminated block comment')
            out.append('\n' if '\n' in src[i:j] else ' ')
            i = j + 2
            continue
        if c in '\'"':
            j = i + 1
            while src[j] != c:
                if src[j] == '\n':
                    fail('line break inside a string literal')
                j += 2 if src[j] == '\\' else 1
            out.append(src[i:j + 1])
            i, last = j + 1, 'a'
            continue
        if c == '`':
            out.append(c)
            modes.append(['tpl'])
            i += 1
            continue
        if c == '/' and last in REGEX_AFTER:
            j, in_class = i + 1, False
            while in_class or src[j] != '/':
                if src[j] == '\n':
                    fail('line break inside a regex literal')
                if src[j] == '\\':
                    j += 1
                elif src[j] == '[':
                    in_class = True
                elif src[j] == ']':
                    in_class = False
                j += 1
            j += 1
            while j < n and src[j].isalpha():
                j += 1
            out.append(src[i:j])
            i, last = j, 'a'
            continue
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (src[j].isalnum() or src[j] in '_$'):
                j += 1
            word = src[i:j]
            out.append(word)
            i, last = j, (word if word in KEYWORDS else 'a')
            continue
        if c == '{':
            modes[-1][1] += 1
        elif c == '}':
            if modes[-1][1] == 0 and len(modes) > 1:
                modes.pop()  # closes a ${ ... } inside a template literal
            else:
                modes[-1][1] -= 1
        if not c.isspace():
            last = c
        out.append(c)
        i += 1
    if len(modes) != 1 or modes[0][1] != 0:
        fail('unbalanced braces or template literals')
    lines = (line.strip() for line in ''.join(out).split('\n'))
    return '\n'.join(l for l in lines if l and not l.startswith('//')) + '\n'


def node_check(code):
    node = shutil.which('node')
    if not node:
        print('  (Node.js not found, syntax check skipped)')
        return
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / 'bundle.mjs'
        path.write_text(code, encoding='utf-8')
        r = subprocess.run([node, '--check', str(path)], capture_output=True, text=True)
    if r.returncode:
        fail('syntax check failed:\n' + r.stderr)
    print('  syntax check passed (node --check)')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('-o', '--out', default=str(ROOT / 'dist' / 'eko-at-dusk.html'))
    ap.add_argument('--no-strip', action='store_true', help='keep comments and indentation')
    args = ap.parse_args()

    mods, order = load_graph()
    code = bundle(mods, order)
    node_check(code)
    if not args.no_strip:
        code = strip_js(code)
        node_check(code)
    for bad in ('</script', '<!--', '<script'):
        if bad in code.lower():
            fail(f'"{bad}" inside the script would end it early')

    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    if html.count(SCRIPT_TAG) != 1:
        fail(f'index.html must contain exactly one {SCRIPT_TAG}')
    html = html.replace(SCRIPT_TAG, '<script type="module">\n' + code + '</script>')
    head, sep, rest = html.partition('\n')
    html = (head + sep + '<!-- Single-file build of Eko at Dusk, made by tools/build_single.py from src/.'
            ' Edit the sources, not this file. -->\n' + rest)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8', newline='\n')
    data = html.encode('utf-8')
    print(f'  {len(order)} modules -> {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}')
    print(f'  {len(data) / 1024:.0f} KB, {len(gzip.compress(data, 9)) / 1024:.0f} KB gzipped')


if __name__ == '__main__':
    main()
