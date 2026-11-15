import * as THREE from 'three';
import { makeRng } from './util.js';

// Every texture is painted onto a canvas at load time: no image files.
const r = makeRng(77);
const R = (a = 0, b = 1) => a + (b - a) * r();
const PICK = (a) => a[Math.floor(r() * a.length)];
const SIGN_FONT = '"Bungee", "Arial Black", Impact, sans-serif';
const BODY_FONT = '"Archivo", "Arial Narrow", Arial, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// Treats a canvas's brightness as height and turns it into a tangent-space normal map.
export function normalFrom(src, strength = 2, invert = false) {
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h), out = g.createImageData(w, h), o = out.data;
  const H = (x, y) => { const i = (((y + h) % h) * w + ((x + w) % w)) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; };
  const s = invert ? -strength : strength;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * s, dy = (H(x, y + 1) - H(x, y - 1)) * s;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return tex(c, { srgb: false });
}

function blotches(g, w, h, n, colors, rMin, rMax, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x = R(0, w), y = R(0, h), rr = R(rMin, rMax);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    const c = PICK(colors);
    g.globalAlpha = R(aMin, aMax);
    grd.addColorStop(0, c); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.globalAlpha = 1;
}
function speckle(g, w, h, n, colors, size = 1.5) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = PICK(colors); g.globalAlpha = R(0.2, 0.7);
    g.fillRect(R(0, w), R(0, h), R(0.5, size), R(0.5, size));
  }
  g.globalAlpha = 1;
}

// Painted plaster with rain stains running down from each floor.
export function plaster() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#ece6dc'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 260, ['#ffffff', '#c9bfb0', '#b8ab98'], 10, 60, 0.08, 0.25);
  for (let i = 0; i < 26; i++) { // rain stains under the floor slab, soft and uneven
    const x = R(0, 512), w = R(10, 60), len = R(40, 200);
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, 'rgba(70,58,44,0.22)'); grd.addColorStop(1, 'rgba(70,58,44,0)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, 0, w / 2, len, 0, 0, Math.PI); g.fill();
  }
  speckle(g, 512, 512, 3000, ['#6d6152', '#ffffff'], 2);
  g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    let x = R(0, 512), y = R(0, 512); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += R(-14, 14); y += R(4, 18); g.lineTo(x, y); }
    g.stroke();
  }
  return { map: tex(c), normalMap: normalFrom(c, 3) };
}

export function asphalt() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#56524d'; g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 14000, ['#2f2c29', '#7a756e', '#46423e', '#8d877f'], 2.2);
  for (let i = 0; i < 6; i++) { // patched repairs
    g.fillStyle = PICK(['#3f3c39', '#625d57']); g.globalAlpha = 0.55;
    g.fillRect(R(0, 460), R(0, 460), R(30, 140), R(30, 120));
  }
  blotches(g, 512, 512, 30, ['#1d1b19'], 8, 40, 0.15, 0.4); // oil
  g.globalAlpha = 1; g.strokeStyle = 'rgba(25,22,20,0.7)'; g.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let x = R(0, 512), y = R(0, 512); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 10; k++) { x += R(-16, 16); y += R(-16, 16); g.lineTo(x, y); }
    g.stroke();
  }
  // Bumps come from fine grit only: round stains in a normal or roughness map read as discs once tiled.
  const [hc, hg] = canvas(512, 512);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, 512, 512);
  speckle(hg, 512, 512, 16000, ['#303030', '#d0d0d0', '#606060'], 2);
  return { map: tex(c), normalMap: normalFrom(hc, 1.4) };
}

// Laterite earth with sand, pure-water sachets and bottle caps.
export function dirt() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#a07a58'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 220, ['#7d5b40', '#b98f69', '#8c6a4e', '#c4a07a'], 15, 70, 0.15, 0.4);
  speckle(g, 512, 512, 9000, ['#5c4331', '#d2b28c', '#6e5a49'], 2.4);
  for (let i = 0; i < 40; i++) {
    g.save(); g.translate(R(0, 512), R(0, 512)); g.rotate(R(0, 6.3));
    g.fillStyle = PICK(['rgba(235,240,245,0.8)', 'rgba(120,170,220,0.8)', 'rgba(200,40,40,0.7)', 'rgba(250,250,250,0.6)']);
    g.fillRect(-R(2, 6), -R(2, 4), R(4, 12), R(3, 8)); g.restore();
  }
  return tex(c);
}

// Corrugated zinc, mostly rusted.
export function roof() {
  const [c, g] = canvas(256, 256);
  for (let x = 0; x < 256; x++) {
    const k = 0.5 + 0.5 * Math.sin((x / 16) * Math.PI * 2);
    const v = Math.round(120 + 90 * k);
    g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(x, 0, 1, 256);
  }
  blotches(g, 256, 256, 90, ['#8a4a22', '#6b3518', '#a85c2a', '#4a2a16'], 10, 50, 0.35, 0.8);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = 'rgba(60,30,15,0.25)'; g.fillRect(R(0, 256), R(0, 256), R(2, 6), R(30, 120));
  }
  const [hc, hg] = canvas(256, 256); // corrugation height for the normal map
  for (let x = 0; x < 256; x++) { const v = Math.round(127 + 127 * Math.sin((x / 16) * Math.PI * 2)); hg.fillStyle = `rgb(${v},${v},${v})`; hg.fillRect(x, 0, 1, 256); }
  return { map: tex(c), normalMap: normalFrom(hc, 6) };
}

// Window atlas: [dark | warm bulb | fluorescent]. Louvre glass behind burglar-proof bars.
export function windows() {
  const [c, g] = canvas(768, 256);
  const [e, ge] = canvas(768, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 768, 256);
  const fills = [null, '#ffc070', '#e6f3ff'];
  for (let k = 0; k < 3; k++) {
    const x0 = k * 256;
    g.fillStyle = '#e0d8cc'; g.fillRect(x0, 0, 256, 256); // painted frame
    g.fillStyle = k ? fills[k] : '#141b20'; g.fillRect(x0 + 16, 16, 224, 224);
    if (k) {
      ge.fillStyle = fills[k]; ge.fillRect(x0 + 16, 16, 224, 224);
      const grd = ge.createRadialGradient(x0 + 128, 128, 10, x0 + 128, 128, 160);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
      ge.fillStyle = grd; ge.fillRect(x0 + 16, 16, 224, 224);
      g.fillStyle = 'rgba(80,40,20,0.35)'; g.fillRect(x0 + 16, 150, 224, 90); // curtain shadow
    }
    for (let i = 0; i < 9; i++) { // louvre slats
      const y = 20 + i * 24;
      g.fillStyle = k ? 'rgba(255,255,255,0.18)' : 'rgba(120,150,170,0.28)'; g.fillRect(x0 + 18, y, 220, 10);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 18, y + 18, 220, 2);
    }
    // burglar-proof bars
    for (const ctx of k ? [g, ge] : [g]) {
      ctx.fillStyle = ctx === g ? '#2b2b2b' : '#000';
      for (let i = 0; i < 7; i++) ctx.fillRect(x0 + 30 + i * 33, 16, 6, 224);
      ctx.fillRect(x0 + 16, 120, 224, 6);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x0 + 80 + i * 48, 120, 22, Math.PI, 0); ctx.stroke(); }
    }
  }
  const map = tex(c, { repeat: false }), emit = tex(e, { repeat: false });
  return { map, emit, uv: (k) => [k / 3 + 0.004, 0.004, (k + 1) / 3 - 0.004, 0.996] };
}

// Shop interiors seen through open fronts: provisions, phones, fabric, canteen pots.
export function shops() {
  const [c, g] = canvas(1024, 256);
  for (let k = 0; k < 4; k++) {
    const x0 = k * 256;
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#f4e7c9'); bg.addColorStop(1, '#8a6f50');
    g.fillStyle = bg; g.fillRect(x0, 0, 256, 256);
    const colors = ['#e23b2e', '#f5c400', '#1b77d2', '#2fa44f', '#ffffff', '#ff7a1a', '#7b3fa0', '#e83e8c'];
    if (k === 0) for (let row = 0; row < 4; row++) { // provisions shelves
      g.fillStyle = '#5b4030'; g.fillRect(x0, 40 + row * 50, 256, 6);
      for (let x = 4; x < 252; x += R(10, 22)) { const h = R(16, 38); g.fillStyle = PICK(colors); g.fillRect(x0 + x, 40 + row * 50 - h, R(8, 18), h); }
    }
    if (k === 1) { // phones and posters
      for (let i = 0; i < 40; i++) { g.fillStyle = '#1a1a1a'; g.fillRect(x0 + 20 + (i % 8) * 28, 30 + Math.floor(i / 8) * 34, 16, 26); g.fillStyle = PICK(['#4fc3ff', '#9effa1', '#ffd36b']); g.fillRect(x0 + 22 + (i % 8) * 28, 32 + Math.floor(i / 8) * 34, 12, 20); }
    }
    if (k === 2) for (let i = 0; i < 26; i++) { // fabric rolls
      g.fillStyle = PICK(colors); g.fillRect(x0 + (i % 13) * 20, 20 + Math.floor(i / 13) * 110, 18, 100);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 100; y += 12) g.fillRect(x0 + (i % 13) * 20, 24 + y + Math.floor(i / 13) * 110, 18, 4);
    }
    if (k === 3) { // canteen pots and steam
      for (let i = 0; i < 4; i++) { g.fillStyle = '#9aa1a6'; g.beginPath(); g.ellipse(x0 + 36 + i * 62, 190, 28, 34, 0, 0, 7); g.fill(); g.fillStyle = '#c0471d'; g.fillRect(x0 + 10 + i * 62, 160, 52, 8); }
      g.fillStyle = '#5b4030'; g.fillRect(x0, 216, 256, 40);
    }
    g.fillStyle = 'rgba(30,20,10,0.35)'; g.fillRect(x0, 200, 256, 56); // counter
  }
  const t = tex(c, { repeat: false });
  return { map: t, uv: (k) => [k / 4 + 0.003, 0.01, (k + 1) / 4 - 0.003, 0.99] };
}

const SIGNS = [
  ['#1d4fa0', '#fff', "GOD'S GRACE", 'ELECTRONICS • PHONES • ACCESSORIES'],
  ['#c0262d', '#fff', 'BLESSED HANDS', 'UNISEX SALON'],
  ['#f6d23a', '#222', 'IYA BASIRAT', 'FOOD CANTEEN • AMALA • EWEDU'],
  ['#0f7a3d', '#fff', 'DIVINE FAVOUR', 'PHARMACY & STORES'],
  ['#fbfaf5', '#c0262d', 'MAMA CHIDI', 'PROVISIONS & COLD DRINKS'],
  ['#222', '#f6d23a', 'TOP RANKING', 'BARBING SALOON'],
  ['#7a2a8c', '#fff', 'EXCEL STAR', 'FASHION HOME'],
  ['#e46a1f', '#fff', 'JESUS IS LORD', 'AUTO SPARE PARTS'],
  ['#1f8fbf', '#fff', 'MERCY POS', 'TRANSFER • WITHDRAWAL • AIRTIME'],
  ['#f2f2ee', '#1d4fa0', 'NO WEAPON FORMED', 'VENTURES'],
  ['#b5121b', '#ffd400', 'ABOKI SUYA SPOT', 'HOT HOT • EVENING TILL LATE'],
  ['#14532d', '#ffd400', 'EMEKA & SONS', 'BUILDING MATERIALS'],
  ['#ffd400', '#b5121b', 'CHARGING POINT', 'PHONE CHARGING ₦200'],
  ['#3d3d3d', '#fff', 'UNIQUE CYBER CAFE', 'PRINTING • TYPING • PHOTOCOPY'],
  ['#0b6e8a', '#fff', 'PURE WATER', 'DEPOT & DISTRIBUTOR'],
  ['#f4efe6', '#0f7a3d', 'ALHAJI MUSA', 'GENERATOR REPAIRS'],
  ['#d9242b', '#fff', 'HOLY GHOST FIRE', 'PRINTING PRESS'],
  ['#2a2a72', '#f6d23a', 'ADEX GLOBAL', 'VENTURES LTD'],
  ['#f6d23a', '#0f3d7a', 'AJOKE TAILORING', '& DESIGNS'],
  ['#111', '#ff4d4d', 'ALAWIYE MUSIC', 'CDs • SPEAKERS • DJ FOR HIRE'],
  ['#1e7f4f', '#fff', 'FAITH CHEMIST', 'PATENT MEDICINE STORE'],
  ['#ffffff', '#111', 'OLUWASEUN', 'PHONE REPAIRS'],
  ['#8b1e1e', '#ffe9b0', 'BUKKA', 'AMALA • GBEGIRI • EWEDU'],
  ['#ff8a1f', '#1a1a1a', 'VULCANIZER', 'TYRES • GAS • BALANCING'],
];
const WALL = [
  ['#b0121b', 'THIS HOUSE IS NOT FOR SALE', 'BEWARE OF 419'],
  ['#161616', 'POST NO BILL', ''],
  ['#b0121b', 'DO NOT URINATE HERE', ''],
  ['#1d3f8a', 'NO PARKING', 'BY ORDER'],
  ['#161616', 'JESUS IS COMING', 'ARE YOU READY?'],
];
export const SIGN_COUNT = SIGNS.length, WALL_COUNT = WALL.length;
export const SIGN_BUSSTOP = SIGNS.length + WALL.length, SIGN_BANNER = SIGN_BUSSTOP + 1, SIGN_BEACH = SIGN_BANNER + 1, SIGN_WAY = SIGN_BEACH + 4, SIGN_MUSIC = 19;

function fitText(g, text, maxW, size, font, weight = '') {
  let s = size;
  do { g.font = `${weight} ${s}px ${font}`; s -= 2; } while (g.measureText(text).width > maxW && s > 10);
}

// One atlas of 4 x 16 cells (512 x 128 each): shop signs, wall writing, bus stop, bridge banner.
export function signAtlas() {
  const W = 2048, H = 2048, cw = 512, ch = 128;
  const [c, g] = canvas(W, H);
  const cell = (i) => [(i % 4) * cw, Math.floor(i / 4) * ch];
  // Hand-painted lettering: every letter sits a little differently.
  const wobble = (text, cx, cy) => {
    let px = cx - g.measureText(text).width / 2;
    g.textAlign = 'left';
    for (const chr of text) {
      const cwid = g.measureText(chr).width;
      g.save(); g.translate(px, cy + R(-1.6, 1.6)); g.rotate(R(-0.035, 0.035)); g.fillText(chr, 0, 0); g.restore();
      px += cwid;
    }
    g.textAlign = 'center';
  };
  const board = (i, bg, fg, l1, l2) => {
    const [x, y] = cell(i);
    g.fillStyle = bg; g.fillRect(x, y, cw, ch);
    for (let k = 0; k < 70; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)'; g.fillRect(x, y + R(0, ch), cw, R(1, 3)); }
    g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, l1, cw - 40, l2 ? 58 : 72, SIGN_FONT); wobble(l1, x + cw / 2, y + (l2 ? 50 : 66));
    if (l2) { fitText(g, l2, cw - 50, 26, BODY_FONT, '800'); wobble(l2, x + cw / 2, y + 98); }
    g.fillStyle = `rgba(255,246,230,${R(0.04, 0.26)})`; g.fillRect(x, y, cw, ch); // sun-bleached
    for (let k = 0; k < 18; k++) { // weathering and rust run-off from the bolts
      const grd = g.createLinearGradient(0, y + 10, 0, y + ch);
      grd.addColorStop(0, 'rgba(110,60,30,0.0)'); grd.addColorStop(1, 'rgba(110,60,30,0.35)');
      g.fillStyle = grd; g.fillRect(x + R(0, cw), y + R(20, 80), R(2, 7), ch);
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 400; k++) g.fillRect(x + R(0, cw), y + R(0, ch), 2, 2);
  };
  SIGNS.forEach((s, i) => board(i, ...s));
  WALL.forEach(([ink, l1, l2], j) => { // hand-painted wall writing on a transparent cell
    const [x, y] = cell(SIGNS.length + j);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [dx, dy] of [[0, 0], [1.5, 1]]) {
      fitText(g, l1, cw - 30, 46, '"Permanent Marker", "Arial Black", sans-serif'); g.fillText(l1, x + cw / 2 + dx, y + (l2 ? 44 : 64) + dy);
      if (l2) { fitText(g, l2, cw - 60, 38, '"Permanent Marker", "Arial Black", sans-serif'); g.fillText(l2, x + cw / 2 + dx, y + 94 + dy); }
    }
    for (let k = 0; k < 14; k++) g.fillRect(x + R(40, cw - 40), y + R(60, 100), 2, R(6, 22)); // paint drips
  });
  board(SIGN_BUSSTOP, '#0b3d91', '#ffffff', 'OJUELEGBA', 'BUS STOP • LAGBUS • DANFO');
  board(SIGN_BANNER, '#f6d23a', '#111111', 'EKO O NI BAJE O!', 'LAGOS WILL NOT SPOIL');
  board(SIGN_BEACH, '#0d6e8c', '#ffffff', 'EKO BEACH', 'THIS WAY • MIND THE TIDE');
  board(SIGN_BEACH + 1, '#f2c418', '#7a1a12', 'SUNSET JOINT', 'COLD DRINKS • SUYA • PEPPER SOUP');
  board(SIGN_BEACH + 2, '#7a1a12', '#ffe9b0', 'MAMA T BEACH BAR', 'CHAPMAN • PALMWINE • FRESH FISH');
  board(SIGN_BEACH + 3, '#ffffff', '#c0262d', 'NO SWIMMING', 'STRONG CURRENT • BY ORDER');
  // Official-looking blue direction signs to the beach: wave-and-sun symbol, name, arrow, distance.
  const way = (i, dir, sub) => {
    const [x, y] = cell(i);
    g.fillStyle = '#1f4e9c'; g.fillRect(x, y, cw, ch);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(x + 7, y + 7, cw - 14, ch - 14);
    g.fillStyle = '#ffffff'; g.fillRect(x + 22, y + 22, 84, 84);
    g.fillStyle = '#f2a81d'; g.beginPath(); g.arc(x + 64, y + 58, 16, Math.PI, 0); g.fill();
    g.strokeStyle = '#1f4e9c'; g.lineWidth = 5;
    for (const yy of [72, 86]) { g.beginPath(); for (let k = 0; k <= 64; k += 4) g.lineTo(x + 32 + k, y + yy + Math.sin(k / 6) * 4); g.stroke(); }
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    fitText(g, 'EKO BEACH', 250, 50, SIGN_FONT); g.fillText('EKO BEACH', x + 122, y + 50);
    fitText(g, sub, 250, 28, BODY_FONT, '800'); g.fillText(sub, x + 124, y + 96);
    const ax = x + 448, ay = y + 64; g.beginPath();
    if (dir === 'up') { g.moveTo(ax, ay - 40); g.lineTo(ax + 32, ay - 6); g.lineTo(ax + 12, ay - 6); g.lineTo(ax + 12, ay + 40); g.lineTo(ax - 12, ay + 40); g.lineTo(ax - 12, ay - 6); g.lineTo(ax - 32, ay - 6); }
    else { const s = dir === 'left' ? -1 : 1; g.moveTo(ax + s * 44, ay); g.lineTo(ax + s * 8, ay - 34); g.lineTo(ax + s * 8, ay - 12); g.lineTo(ax - s * 40, ay - 12); g.lineTo(ax - s * 40, ay + 12); g.lineTo(ax + s * 8, ay + 12); g.lineTo(ax + s * 8, ay + 34); }
    g.closePath(); g.fill(); g.textAlign = 'center';
  };
  [['up', '50 m AHEAD'], ['up', '100 m AHEAD'], ['up', '150 m AHEAD'], ['up', '200 m AHEAD'], ['up', '250 m AHEAD'], ['left', 'TURN LEFT HERE'], ['right', 'TURN RIGHT HERE']].forEach(([d, s], k) => way(SIGN_WAY + k, d, s));
  const t = tex(c, { repeat: false });
  const inset = 2 / W;
  return { map: t, uv: (i) => { const [x, y] = cell(i); return [x / W + inset, 1 - (y + ch) / H + inset, (x + cw) / W - inset, 1 - y / H - inset]; } };
}

// Four rooftop billboards (2 x 2 cells of 1024 x 512). Brands are invented.
export function billboards() {
  const [c, g] = canvas(2048, 1024);
  const ads = [
    ['#7b1fa2', '#e040fb', 'OYA DATA', '10GB FOR ₦1,500', 'Browse like a big man'],
    ['#f9c80e', '#f86624', 'SUPA GARI', 'The taste of home', 'Soak am, drink am, enjoy am'],
    ['#00897b', '#26c6da', 'EKO PAINTS', 'Colour your house', 'Colour your life'],
    ['#c62828', '#ff7043', 'CHILL-AM COLA', 'Chill am!', 'The cold one for the go-slow'],
  ];
  ads.forEach(([a, b, h, s1, s2], i) => {
    const x = (i % 2) * 1024, y = Math.floor(i / 2) * 512;
    const grd = g.createLinearGradient(x, y, x + 1024, y + 512);
    grd.addColorStop(0, a); grd.addColorStop(1, b);
    g.fillStyle = grd; g.fillRect(x, y, 1024, 512);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + 780 + R(-120, 160), y + R(60, 460), R(50, 160), 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    fitText(g, h, 900, 150, SIGN_FONT); g.fillText(h, x + 60, y + 210);
    g.font = `800 72px ${BODY_FONT}`; g.fillText(s1, x + 64, y + 320);
    g.font = `500 44px ${BODY_FONT}`; g.globalAlpha = 0.85; g.fillText(s2, x + 66, y + 400); g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 900; k++) g.fillRect(x + R(0, 1024), y + R(0, 512), 3, 3);
  });
  const t = tex(c, { repeat: false });
  return { map: t, uv: (i) => { const x = (i % 2) * 0.5, y = Math.floor(i / 2) * 0.5; return [x + 0.002, 1 - y - 0.5 + 0.002, x + 0.498, 1 - y - 0.002]; } };
}

// Soft round glow for light pools, headlight spill and lamps.
export function glow() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false, srgb: false });
}

// Ankara-style print, light so each person's clothing colour tints it.
export function ankara() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    const ox = (y / 32) % 2 ? 16 : 0;
    g.fillStyle = '#9a9a9a'; g.beginPath(); g.arc(x + ox + 16, y + 16, 11, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + ox + 16, y + 16, 5, 0, 7); g.fill();
    g.fillStyle = '#5a5a5a'; g.fillRect(x + ox + 1, y + 1, 6, 6);
  }
  return tex(c);
}

// Unplastered sandcrete blocks (450 x 225 mm) in grey mortar; one tile covers 1.8 m.
export function blocks() {
  const [c, g] = canvas(512, 512), bw = 128, bh = 64;
  g.fillStyle = '#77726a'; g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
    const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, v = R(-16, 16);
    g.fillStyle = `rgb(${150 + v},${145 + v},${133 + v})`; g.fillRect(x + 4, y + 4, bw - 8, bh - 8);
  }
  speckle(g, 512, 512, 14000, ['#5f5a52', '#bdb6aa', '#8a8478'], 2.2);
  blotches(g, 512, 512, 40, ['#4e4136', '#9b8a72'], 20, 80, 0.08, 0.25);
  return { map: tex(c), normalMap: normalFrom(c, 5) };
}

// Glazed wall tiles (30 x 20 cm) with dirty grout; one tile covers 1.2 m.
export function tiles() {
  const [c, g] = canvas(512, 512), [rc, rg] = canvas(512, 512), tw = 128, th = 512 / 6;
  g.fillStyle = '#6d665c'; g.fillRect(0, 0, 512, 512); rg.fillStyle = '#e6e6e6'; rg.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) {
    const v = R(-8, 8); g.fillStyle = `rgb(${226 + v},${218 + v},${200 + v})`; g.fillRect(x * tw + 3, y * th + 3, tw - 6, th - 6);
    rg.fillStyle = 'rgb(45,45,45)'; rg.fillRect(x * tw + 3, y * th + 3, tw - 6, th - 6);
  }
  blotches(g, 512, 512, 30, ['#7a6a55'], 20, 80, 0.06, 0.18);
  return { map: tex(c), normalMap: normalFrom(c, 3), roughnessMap: tex(rc, { srgb: false }) };
}

// Decorative breeze blocks for parapets and fence tops, with real cut-outs.
export function breeze() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const cx = x * 128 + 64, cy = y * 128 + 64;
    g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fill();
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.moveTo(cx + dx * 16, cy + dy * 52); g.lineTo(cx + dx * 52, cy + dy * 52); g.lineTo(cx + dx * 52, cy + dy * 16); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-atop';
  speckle(g, 256, 256, 3000, ['#8f887c', '#ffffff'], 2);
  blotches(g, 256, 256, 20, ['#5d5246'], 10, 40, 0.1, 0.3);
  g.globalCompositeOperation = 'source-over';
  return tex(c);
}

// Dark rain streaks for decals under sills, parapets and signs (used as an alpha map).
export function streaks() {
  const [c, g] = canvas(128, 256);
  for (let i = 0; i < 24; i++) {
    const x = R(4, 124), w = R(2, 12), len = R(50, 256), a = R(0.25, 0.85);
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x, 0, w, len);
  }
  const fade = g.createLinearGradient(0, 0, 128, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.15, 'rgba(0,0,0,0)'); fade.addColorStop(0.85, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 128, 256); g.globalCompositeOperation = 'source-over';
  return tex(c, { srgb: false });
}

// Window frames over the fake rooms: opaque frame and burglar bars, see-through glass.
// Cell 0: naco louvres behind white bars. Cell 1: bronze sliding window behind black bars.
export function windowFrames() {
  const [c, g] = canvas(512, 256);
  for (let k = 0; k < 2; k++) {
    const x0 = k * 256, fr = k ? '#5a4632' : '#e4dfd5';
    g.fillStyle = fr;
    g.fillRect(x0, 0, 256, 16); g.fillRect(x0, 240, 256, 16); g.fillRect(x0, 0, 16, 256); g.fillRect(x0 + 240, 0, 16, 256);
    g.fillRect(x0 + 123, 16, 10, 224);
    if (!k) for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(205,220,225,0.32)'; g.fillRect(x0 + 16, 22 + i * 22, 224, 4); }
    g.fillStyle = k ? '#161616' : '#f0efe9';
    for (let i = 0; i < 6; i++) g.fillRect(x0 + 34 + i * 38, 16, 7, 224);
    g.fillRect(x0 + 16, 92, 224, 7); g.fillRect(x0 + 16, 168, 224, 7);
    g.strokeStyle = g.fillStyle; g.lineWidth = 5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x0 + 70 + i * 58, 92, 22, Math.PI, 0); g.stroke(); }
  }
  return { map: tex(c, { repeat: false }), uv: (k) => [k / 2 + 0.004, 0.004, (k + 1) / 2 - 0.004, 0.996] };
}

// Corrugated roller shutter, scuffed and rusty.
export function shutter() {
  const [c, g] = canvas(256, 256);
  for (let y = 0; y < 256; y++) {
    const k = 0.5 + 0.5 * Math.sin((y / 8) * Math.PI * 2), v = Math.round(100 + 62 * k);
    g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(0, y, 256, 1);
  }
  blotches(g, 256, 256, 50, ['#7a4a2a', '#3a2a1e', '#a06a3a'], 6, 40, 0.15, 0.5);
  return { map: tex(c), normalMap: normalFrom(c, 4) };
}
