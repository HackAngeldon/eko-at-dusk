import * as THREE from 'three';
import { makeRng } from './util.js';

// Painted vehicle sides with wear: sun-faded paint, road dust, rust round the wheel arches,
// scratches, dents and the odd replacement panel in primer.
// Layout: u 0..0.9 runs along the side from the front (u = 0) to the back; u 0.92..1 is plain paint
// for the front, back and roof. v runs from the ground (0) up to `hm` metres.
const r = makeRng(4242);
const R = (a = 0, b = 1) => a + (b - a) * r();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}

function painter(w, h, lh, hm) {
  const [c, g] = canvas(w, h), [rc, rg] = canvas(w, h);
  const X = (df) => (df / (2 * lh)) * 0.9 * w, Y = (y) => (1 - y / hm) * h;
  const both = (fn, paint, rough) => { g.fillStyle = paint; rg.fillStyle = rough; fn(g); fn(rg); };
  return {
    c, g, rc, rg, X, Y, w, h,
    rect(df0, y0, df1, y1, paint, rough) { both((ctx) => ctx.fillRect(X(df0), Y(y1), X(df1) - X(df0), Y(y0) - Y(y1)), paint, rough); },
    strip(y0, y1, paint, rough) { both((ctx) => ctx.fillRect(0, Y(y1), w, Y(y0) - Y(y1)), paint, rough); },
    base(paint, rough) { both((ctx) => ctx.fillRect(0, 0, w, h), paint, rough); },
    mottle(n, cols) {
      for (let i = 0; i < n; i++) {
        const x = R(0, w), y = R(0, h), rr = R(10, 60), grd = g.createRadialGradient(x, y, 0, x, y, rr);
        grd.addColorStop(0, cols[i % cols.length]); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    },
    dirt(y0, y1, a) {
      for (const [ctx, col] of [[g, '72,52,34'], [rg, '215,215,215']]) {
        const grd = ctx.createLinearGradient(0, Y(y0), 0, Y(y1));
        grd.addColorStop(0, `rgba(${col},${ctx === g ? a : 0.8})`); grd.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = grd; ctx.fillRect(0, Y(y1), w, Y(y0) - Y(y1));
      }
    },
    rust(df, y, rad, n) {
      for (let i = 0; i < n; i++) {
        const a = R(Math.PI * 1.05, Math.PI * 1.95), rr = rad * R(1.02, 1.35);
        const x = X(df) + Math.cos(a) * (X(rr) - X(0)), yy = Y(y) + Math.sin(a) * (Y(0) - Y(rr)), s = R(3, 14);
        both((ctx) => { ctx.beginPath(); ctx.ellipse(x, yy, s * 1.3, s, R(0, 3), 0, 7); ctx.fill(); }, `rgba(${R(95, 140) | 0},${R(45, 65) | 0},20,${R(0.5, 0.9)})`, 'rgba(240,240,240,0.9)');
        g.fillStyle = 'rgba(40,20,10,0.6)'; g.beginPath(); g.arc(x, yy, s * 0.35, 0, 7); g.fill();
      }
    },
    spots(n, y0, y1, col) { for (let i = 0; i < n; i++) both((ctx) => { ctx.beginPath(); ctx.arc(R(0, w * 0.9), R(Y(y1), Y(y0)), R(1.5, 5), 0, 7); ctx.fill(); }, col, 'rgba(235,235,235,0.9)'); },
    scratches(n) {
      g.strokeStyle = 'rgba(255,245,220,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < n; i++) { const x = R(0, w * 0.9), y = R(h * 0.3, h * 0.85); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-60, 60), y + R(-6, 6)); g.stroke(); }
    },
    dents(n) {
      for (let i = 0; i < n; i++) {
        const x = R(0, w * 0.9), y = R(h * 0.35, h * 0.85), rr = R(12, 30);
        const grd = g.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr);
        grd.addColorStop(0, 'rgba(255,255,255,0.12)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rr * 1.4, rr, 0, 0, 7); g.fill();
      }
    },
    seam(df, y0, y1) { g.fillStyle = 'rgba(10,8,5,0.75)'; g.fillRect(X(df) - 1, Y(y1), 2, Y(y0) - Y(y1)); },
    hseam(df0, df1, y) { g.fillStyle = 'rgba(10,8,5,0.6)'; g.fillRect(X(df0), Y(y) - 1, X(df1) - X(df0), 2); },
    done() { return { map: tex(c), roughnessMap: tex(rc, false) }; },
  };
}

// Lagos yellow with the two black bands. `patched` adds a primer-grey replacement door.
export function danfoLivery(o) {
  const { lh, hm, stripes, arches, doors, patched } = o;
  const p = painter(1024, 512, lh, hm);
  p.base('#d99e00', 'rgb(150,150,150)');
  p.mottle(160, ['rgba(255,214,90,0.22)', 'rgba(160,100,0,0.18)', 'rgba(240,190,60,0.2)']);
  if (patched) p.rect(doors[0][0], 0.35, doors[0][1], 1.9, '#8f8b80', 'rgb(220,220,220)');
  if (patched) p.rect(doors[1][0], 0.35, doors[1][1], 0.9, '#c7a23a', 'rgb(190,190,190)');
  for (const [y0, y1] of stripes) p.strip(y0, y1, '#141210', 'rgb(170,170,170)');
  for (const [d0, d1] of doors) { p.seam(d0, 0.35, 1.85); p.seam(d1, 0.35, 1.85); }
  p.hseam(doors[1][0], doors[1][1], 1.8);
  p.dents(14); p.scratches(70);
  for (const df of arches) p.rust(df, 0.32, 0.45, 26);
  p.spots(70, 0.3, 0.6, 'rgba(110,55,20,0.75)');
  p.spots(20, 0.6, 1.8, 'rgba(110,55,20,0.6)');
  p.dirt(0.3, 0.85, 0.75);
  // Plain paint strip for the front, back and roof
  p.g.fillStyle = '#d29a05'; p.g.fillRect(p.w * 0.92, 0, p.w * 0.08, p.h);
  return p.done();
}

export function brtLivery() {
  const lh = 6.15, hm = 3.3, p = painter(2048, 512, lh, hm);
  p.base('#1d4b96', 'rgb(110,110,110)');
  p.strip(1.35, 2.86, '#16181c', 'rgb(90,90,90)');
  p.strip(2.86, 3.3, '#eceae4', 'rgb(110,110,110)');
  p.strip(1.12, 1.28, '#c62f2a', 'rgb(110,110,110)');
  p.mottle(80, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)']);
  for (const [d0, d1] of [[0.9, 2.0], [5.9, 7.0]]) { p.rect(d0, 0.32, d1, 2.75, '#22272c', 'rgb(60,60,60)'); p.seam((d0 + d1) / 2, 0.32, 2.75); }
  p.g.fillStyle = '#f4f2ec'; p.g.font = '900 120px "Archivo", Arial, sans-serif'; p.g.textBaseline = 'alphabetic';
  p.g.fillText('EKO BRT', p.X(2.5), p.Y(0.48));
  p.g.font = '700 46px "Archivo", Arial, sans-serif'; p.g.fillText('CMS  •  OJOTA  •  IKORODU', p.X(8.0), p.Y(0.62));
  p.scratches(60); p.dents(10);
  for (const df of [2.6, 9.4]) p.rust(df, 0.35, 0.55, 8);
  p.dirt(0.32, 1.0, 0.65);
  p.g.fillStyle = '#1d4b96'; p.g.fillRect(p.w * 0.92, p.Y(1.35), p.w * 0.08, p.h);
  p.g.fillStyle = '#eceae4'; p.g.fillRect(p.w * 0.92, 0, p.w * 0.08, p.Y(2.86));
  return p.done();
}

// Cars are painted white here and tinted per car, so one texture serves every colour.
export function carLivery(o) {
  const { lh, hm, doors } = o, p = painter(512, 256, lh, hm);
  p.base('#f4f4f2', 'rgb(70,70,70)');
  for (const d of doors) p.seam(d, 0.36, 1.0);
  p.hseam(0, 2 * lh, 0.62);
  p.dents(5); p.scratches(30);
  p.spots(30, 0.3, 0.5, 'rgba(90,60,40,0.5)');
  p.dirt(0.28, 0.7, 0.6);
  p.g.fillStyle = 'rgba(200,190,170,0.18)'; p.g.fillRect(0, 0, p.w, p.h);
  return p.done();
}

// Number plates and the hand-painted slogans danfo drivers put on windscreens and back windows.
// Rows 0-3: slogans (full width). Rows 4-7: plates, four per row.
export const SLOGANS = ["GOD'S TIME IS THE BEST", 'NO FOOD FOR LAZY MAN', 'NO CONDITION IS PERMANENT', 'MONEY MISS ROAD'];
export function decalAtlas() {
  const W = 1024, H = 512, [c, g] = canvas(W, H), rh = H / 8;
  SLOGANS.forEach((s, i) => {
    const y = i * rh + rh / 2;
    g.font = 'italic 900 40px "Archivo", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(10,10,10,0.9)'; g.strokeText(s, W / 2, y);
    g.fillStyle = i % 2 ? '#f6d23a' : '#ffffff'; g.fillText(s, W / 2, y);
  });
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 256, y = (4 + Math.floor(i / 4)) * rh;
    g.fillStyle = '#f2f1ec'; g.fillRect(x + 6, y + 6, 244, rh - 12);
    g.strokeStyle = '#1d3f8a'; g.lineWidth = 3; g.strokeRect(x + 9, y + 9, 238, rh - 18);
    g.fillStyle = '#1d3f8a'; g.font = '700 11px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('EKO STATE', x + 128, y + 18);
    g.fillStyle = '#c0262d'; g.font = '800 26px "Archivo", Arial, sans-serif';
    const L = 'ABCDEFGHJKLMNPRSTUVWXYZ', pick3 = () => [0, 1, 2].map(() => L[Math.floor(R(0, L.length))]).join('');
    g.fillText(`${pick3()} ${Math.floor(R(100, 999))} ${pick3().slice(0, 2)}`, x + 128, y + 42);
  }
  const t = tex(c);
  return {
    map: t,
    slogan: (i) => [0.02, 1 - (i + 1) / 8 + 0.005, 0.98, 1 - i / 8 - 0.005],
    plate: (i) => { const x = (i % 4) / 4, y = (4 + Math.floor(i / 4)) / 8; return [x + 0.006, 1 - y - 1 / 8 + 0.012, x + 0.25 - 0.006, 1 - y - 0.012]; },
  };
}

// Soft shadow card: dark under the vehicle, fading toward the far end of the long sunset shadow.
export function shadowCard() {
  const w = 64, h = 256, [c, g] = canvas(w, h), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = 1 - y / h, ex = Math.min(x, w - 1 - x) / (w * 0.22);
    const a = Math.min(1, ex) ** 1.5 * (v > 0.7 ? 1 : (v / 0.7) ** 1.6), i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = Math.round(a * 255); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}
