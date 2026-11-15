// Street sound, all synthesised: traffic rumble, crowd murmur, generators,
// horns placed at the cars that sound them, and a shop speaker playing a loop.
export function createAudio() {
  let ctx = null, master = null, out = null, noise = null, brown = null, muted = false;
  const gens = [];
  let genSources = [], musicPos = null, lastHorn = 0;

  function buffer(kind) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  function loop(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
  function panner(x, y, z, ref = 4, roll = 1.3) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 400;
    setPos(p, x, y, z); p.connect(out); return p;
  }
  function setPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }

  let streetGains = [], waveP = null, shoreFn = null, windGain = null;
  function start(city, shore, bar) {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    shoreFn = shore;
    ctx = new AudioContext({ latencyHint: 'playback' });
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    out = master;
    noise = buffer('white'); brown = buffer('brown');

    const rumble = loop(brown), lp = ctx.createBiquadFilter(), rg = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 240; rg.gain.value = 0.5;
    rumble.connect(lp); lp.connect(rg); rg.connect(master);

    const crowd = loop(noise), bp = ctx.createBiquadFilter(), cg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.9; cg.gain.value = 0.018;
    lfo.frequency.value = 0.23; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(cg.gain); lfo.start();
    crowd.connect(bp); bp.connect(cg); cg.connect(master);
    streetGains = [[rg, 0.5], [cg, 0.018]];

    // Surf: filtered noise that swells and fades with each wave, placed on the nearest bit of shore.
    if (shoreFn) {
      const surf = loop(brown), sf = ctx.createBiquadFilter(), sg = ctx.createGain(), hiss = loop(noise), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      sf.type = 'lowpass'; sf.frequency.value = 900; hf.type = 'bandpass'; hf.frequency.value = 2400; hf.Q.value = 0.6; hg.gain.value = 0.06;
      sg.gain.value = 0.55;
      for (const [hz, amt] of [[0.13, 0.35], [0.071, 0.2]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = hz; og.gain.value = amt; o.connect(og); og.connect(sg.gain); o.start(); }
      waveP = panner(-150, 0, 0, 14, 1.0);
      surf.connect(sf); sf.connect(sg); hiss.connect(hf); hf.connect(hg); hg.connect(sg); sg.connect(waveP);
    }

    for (const g of city.generators) gens.push(g);
    for (let i = 0; i < 3; i++) { // three generator voices follow the nearest generators
      const p = panner(0, -100, 0, 2.5, 1.6), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.22;
      for (const [type, hz] of [['sawtooth', 98 + i * 3], ['square', 49 + i * 1.5]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.connect(f); o.start(); }
      const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 7 + i; tg.gain.value = 0.06; trem.connect(tg); tg.connect(g.gain); trem.start();
      f.connect(g); g.connect(p); genSources.push(p);
    }
    if (city.music) startMusic(city.music);
    if (bar) startMusic(bar);
    // Sea breeze: hollow, filtered noise that rises and falls with the gusts (louder on the beach).
    const wind = loop(noise), wf = ctx.createBiquadFilter(), wg = ctx.createGain(), wl = ctx.createOscillator(), wlg = ctx.createGain();
    wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.45; wg.gain.value = 0;
    wl.frequency.value = 0.09; wlg.gain.value = 140; wl.connect(wlg); wlg.connect(wf.frequency); wl.start();
    wind.connect(wf); wf.connect(wg); wg.connect(master); windGain = wg;
  }

  // Horns: a two-note "pam", or three short angry blasts when someone blocks the road.
  function horn(x, y, z, type, angry) {
    if (!ctx || ctx.currentTime - lastHorn < 0.35) return;
    lastHorn = ctx.currentTime;
    const base = ({ danfo: 370, car: 420, brt: 290, keke: 640, okada: 900 }[type] || 400) * (0.94 + Math.random() * 0.12);
    const p = panner(x, y, z, 5, 1.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 2600; f.connect(g); g.connect(p); g.gain.value = 0;
    for (const m of [1, 1.26]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = base * m; o.connect(f); o.start(); o.stop(ctx.currentTime + 2.2); }
    const t0 = ctx.currentTime + 0.02, beeps = angry ? 3 : Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < beeps; i++) {
      const s = t0 + i * (angry ? 0.22 : 0.3), len = angry ? 0.14 : beeps === 1 ? 0.25 + Math.random() * 0.6 : 0.16;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.16, s + 0.015); g.gain.setValueAtTime(0.16, s + len); g.gain.linearRampToValueAtTime(0, s + len + 0.03);
    }
    setTimeout(() => p.disconnect(), 2500);
  }

  // A shop speaker playing a short afrobeats-style loop through a cheap, slightly crunchy speaker.
  // Gulls: a few falling "kee-ow" calls from somewhere overhead.
  function gull(x, y, z) {
    const p = panner(x, y, z, 8, 1.0), f = ctx.createBiquadFilter(), g = ctx.createGain(), o = ctx.createOscillator();
    f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 2; o.type = 'sawtooth'; o.connect(f); f.connect(g); g.connect(p); g.gain.value = 0;
    const t0 = ctx.currentTime + 0.05, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = t0 + i * 0.34;
      o.frequency.setValueAtTime(1450 + Math.random() * 250, s); o.frequency.exponentialRampToValueAtTime(800, s + 0.24);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.045, s + 0.03); g.gain.linearRampToValueAtTime(0, s + 0.26);
    }
    o.start(t0); o.stop(t0 + n * 0.34 + 0.3); setTimeout(() => p.disconnect(), 3000);
  }

  function startMusic(pos) {
    const p = panner(pos.x, pos.y, pos.z, 3, 1.5), sp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), sh = ctx.createWaveShaper(), g = ctx.createGain();
    sp.type = 'lowpass'; sp.frequency.value = 3200; hp.type = 'highpass'; hp.frequency.value = 70;
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 1.8); } sh.curve = curve;
    g.gain.value = 0.55; g.connect(sh); sh.connect(hp); hp.connect(sp); sp.connect(p);
    const bpm = 104, step = 60 / bpm / 4;
    const K = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], RIM = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0];
    const BELL = { 0: 1, 3: 0, 6: 0, 8: 1, 10: 0, 13: 0 }, ROOTS = [110, 87.3, 130.8, 98];
    const CH = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    let n = 0, next = ctx.currentTime + 0.1;
    const env = (node, t, peak, dec) => { node.gain.setValueAtTime(peak, t); node.gain.exponentialRampToValueAtTime(0.001, t + dec); };
    const osc = (type, f, t, dur, peak, dest = g) => { const o = ctx.createOscillator(), e = ctx.createGain(); o.type = type; o.frequency.value = f; o.connect(e); e.connect(dest); env(e, t, peak, dur); o.start(t); o.stop(t + dur + 0.05); return o; };
    const hit = (t, freq, q, dur, peak, type = 'bandpass') => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain(); s.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f); f.connect(e); e.connect(g); env(e, t, peak, dur); s.start(t, Math.random()); s.stop(t + dur + 0.05); };
    setInterval(() => {
      while (next < ctx.currentTime + 0.15) {
        const i = n % 16, bar = Math.floor(n / 16) % 4, t = next;
        if (K[i]) { const o = osc('sine', 120, t, 0.18, 0.9); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); }
        if (RIM[i]) hit(t, 1900, 3, 0.07, 0.35);
        hit(t, 7000, 1, 0.035, i % 2 ? 0.07 : 0.14, 'highpass');
        if (i in BELL) { osc('triangle', BELL[i] ? 1320 : 990, t, 0.16, 0.12); osc('sine', (BELL[i] ? 1320 : 990) * 2.7, t, 0.08, 0.04); }
        if (i === 0 || i === 6 || i === 10) osc('triangle', ROOTS[bar], t, step * 3, 0.5);
        if (i % 4 === 2) CH[bar].forEach((f, k) => osc('sawtooth', f * 2, t + k * 0.012, 0.16, 0.04));
        n++; next += step;
      }
    }, 30);
  }

  let genTick = 0;
  function update(cam, fwd, dt) {
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = cam.x; L.positionY.value = cam.y; L.positionZ.value = cam.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(cam.x, cam.y, cam.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    if (waveP) setPos(waveP, shoreFn(cam.z), 0, cam.z);
    const k = Math.exp(-Math.max(0, -cam.x - 12) / 30);
    for (const [g, base] of streetGains) g.gain.setTargetAtTime(base * k, ctx.currentTime, 0.3);
    const kb = Math.min(1, Math.max(0, (-cam.x - 30) / 25)), now = ctx.currentTime;
    if (windGain) windGain.gain.setTargetAtTime((0.03 + 0.12 * kb) * (0.55 + 0.45 * Math.sin(now * 0.31) * Math.sin(now * 0.11 + 1)), now, 0.4);
    if (kb > 0.5 && Math.random() < dt * 0.22) gull(cam.x - 15 - Math.random() * 40, 14, cam.z + (Math.random() - 0.5) * 80);
    genTick -= dt;
    if (genTick < 0 && gens.length) {
      genTick = 0.5;
      const near = gens.map((g) => [g, (g.x - cam.x) ** 2 + (g.z - cam.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, genSources.length);
      near.forEach(([g], i) => setPos(genSources[i], g.x, g.y, g.z));
    }
  }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    return muted;
  }
  function suspend(on) { if (ctx) on ? ctx.suspend() : ctx.resume(); }
  return { start, horn, update, toggleMute, suspend, get muted() { return muted; } };
}
