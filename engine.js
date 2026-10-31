'use strict';
// ================= CONSTANTES (todo lo que se ajusta a mano) =================
// Velocidades en píxeles por cuadro; el juego corre a 60 cuadros por segundo.
const TILE = 8, VW = 320, VH = 180;
// --- En el agua ---
const WATER_GRAVITY = 0.04;  // hundimiento leve que siempre tira para abajo
const BUOYANCY = 0.11;       // flotación: empuje hacia arriba mientras estás sumergido
const WATER_DRAG = 0.93;     // arrastre por cuadro (1 = sin freno, más bajo = agua más espesa)
const SURFACE_DAMP = 0.8;    // freno vertical extra al llegar a la superficie (evita salir disparado)
const STROKE_IMPULSE = 2.0;  // empujón de cada brazada
const STROKE_COOLDOWN = 14;  // cuadros mínimos entre brazadas (apretar más rápido no sirve)
const ARROW_KICK = 0.03;     // patada suave con solo las flechas (0 = solo se avanza con brazadas)
const WATER_MAX = 3.2;       // velocidad máxima nadando
const ENTRY_DAMP = 0.35;     // cuánto frena el agua al caer en ella (0 = frena todo, 1 = nada)
// --- Fuera del agua ---
const GRAVITY = 0.25;        // gravedad real: pesás
const MAX_FALL = 5;          // velocidad máxima de caída
const WALK_SPEED = 1.3;      // velocidad caminando
const WALK_ACCEL = 0.25;     // qué tan rápido arrancás y frenás al caminar
const AIR_CONTROL = 0.06;    // cuánto podés corregir en el aire
const JUMP_VY = 3.0;         // fuerza del salto en tierra (~2 casillas de alto)
const FALL_LIMIT = 6;        // casillas de caída que aguantás; más = volvés al inicio (0 = sin límite)
// --- Mariposa ---
const DOLPHIN_VY = 4.3;      // salto delfín: fuerza hacia arriba (~4 casillas)
const DOLPHIN_VX = 2.2;      // salto delfín: fuerza hacia adelante
const DOLPHIN_DEPTH = 10;    // píxeles bajo la superficie desde donde todavía podés hacer el delfín
// ============================================================================

const PW = 6, PH = 6, SOLID = '#X';
const LOOK = { skin: '#E8B48A', hair: '#F0CC62', suit: '#2E8B57', cheek: '#E06666', eye: '#222' }; // Mati

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
let L, map, wet, W, H, P, start, goal, state, t = 0, parts = [], cam = { x: 0, y: 0, shake: 0 };

// ---------- Nivel ----------
function loadLevel(i) {
  L = LEVELS[i]; map = L.map.map(r => r.split('')); H = map.length; W = map[0].length;
  const isW = (c, r) => '~B'.includes(tileAt(c, r));
  wet = map.map((row, r) => row.map((ch, c) => '~B'.includes(ch) ||
    ('MEPCFS=^'.includes(ch) && (isW(c, r - 1) || isW(c, r + 1) || (isW(c - 1, r) && isW(c + 1, r))))));
  map.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'S') start = { x: c * TILE + 1, y: r * TILE + TILE - PH - 0.01 }; if (ch === 'F') goal = { c, r }; }));
  P = { abil: {} }; state = 'play'; respawn(); UI.button('bDolphin', false); UI.clear();
}
function tileAt(c, r) { return c < 0 || c >= W || r >= H ? '#' : r < 0 ? '.' : map[r][c]; }
const T = v => Math.floor(v / TILE);
const solidAt = (x, y) => SOLID.includes(tileAt(T(x), T(y)));
const wetAt = (x, y) => y >= 0 && x >= 0 && T(x) < W && T(y) < H && wet[T(y)][T(x)];
const hits = (x, y) => solidAt(x, y) || solidAt(x + PW - .01, y) || solidAt(x, y + PH - .01) || solidAt(x + PW - .01, y + PH - .01);

function respawn() {
  Object.assign(P, { x: start.x, y: start.y, vx: 0, vy: 0, face: 1, water: false, ground: false, cd: 0, anim: 0, dead: 0, peak: start.y, dolph: false });
}
function die() { P.dead = 45; cam.shake = 6; }

// ---------- Input (teclado + táctil) ----------
const held = {}, queue = {}, pressed = {};
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'stroke', z: 'dolphin', Z: 'dolphin' };
const keyHeld = {}, touchHeld = {};
addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) queue[k] = true; keyHeld[k] = true; });
addEventListener('keyup', e => { const k = KEYS[e.key]; if (k) keyHeld[k] = false; });
function readInput() {
  for (const k of ['left', 'right', 'up', 'down', 'stroke', 'dolphin']) {
    held[k] = keyHeld[k] || touchHeld[k]; pressed[k] = queue[k]; queue[k] = false;
  }
}
// Táctil: cada dedo se asigna a la cruz o a un botón al apoyarlo; varios dedos a la vez.
const touches = {};
function zoneAt(x, y) {
  for (const id of ['bStroke', 'bDolphin']) {
    const el = document.getElementById(id); if (el.style.display === 'none') continue;
    const b = el.getBoundingClientRect(), m = b.width * .15;
    if (x > b.left - m && x < b.right + m && y > b.top - m && y < b.bottom + m) return el.dataset.k;
  }
  const d = document.getElementById('dpad').getBoundingClientRect();
  return Math.hypot(x - d.left - d.width / 2, y - d.top - d.height / 2) < d.width * .7 ? 'dpad' : null;
}
function onTouch(e) {
  e.preventDefault();
  const live = {};
  for (const tc of e.touches) {
    let z = touches[tc.identifier]; if (z !== 'dpad') z = zoneAt(tc.clientX, tc.clientY);
    touches[tc.identifier] = z; live[tc.identifier] = 1;
    if (z === 'dpad') {
      const d = document.getElementById('dpad').getBoundingClientRect();
      const nx = tc.clientX - d.left - d.width / 2, ny = tc.clientY - d.top - d.height / 2, n = Math.hypot(nx, ny);
      if (n > d.width * .1) { live.right = nx / n > .38; live.left = nx / n < -.38; live.down = ny / n > .38; live.up = ny / n < -.38; }
    } else if (z) live[z] = true;
  }
  for (const id in touches) if (!live[id]) delete touches[id];
  for (const k of ['left', 'right', 'up', 'down', 'stroke', 'dolphin']) {
    if (live[k] && !touchHeld[k]) queue[k] = true;
    touchHeld[k] = !!live[k];
  }
}
for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(ev, onTouch, { passive: false });

// ---------- Física ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function update() {
  readInput(); t++;
  if (state === 'done') { if (pressed.stroke || pressed.dolphin) loadLevel(0); return; }
  if (P.dead) { if (--P.dead === 0) respawn(); return; }
  const p = P, cx = p.x + PW / 2, cy = p.y + PH / 2;
  const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0), dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  if (dx) p.face = dx;
  if (p.cd) p.cd--;
  if (p.anim) p.anim--;
  const was = p.water;
  p.water = wetAt(cx, cy + 3); // cuenta como agua hasta 3 px por encima de la superficie: así flotás
  if (p.water !== was) { if (Math.abs(p.vy) > .8) splash(cx, cy, Math.abs(p.vy)); if (p.water) { p.vy *= ENTRY_DAMP; p.vx *= .6; p.dolph = false; } }

  if (p.water) {
    p.vy += WATER_GRAVITY - (wetAt(cx, cy) ? BUOYANCY : 0);
    p.vx += dx * ARROW_KICK; p.vy += dy * ARROW_KICK;
    if (pressed.stroke && !p.cd) {
      const ix = dx || dy ? dx : p.face, iy = dy, n = Math.hypot(ix, iy);
      p.vx += ix / n * STROKE_IMPULSE; p.vy += iy / n * STROKE_IMPULSE;
      p.cd = STROKE_COOLDOWN; p.anim = 12; bubbles(cx, cy, 3);
    }
    p.vx *= WATER_DRAG; p.vy *= WATER_DRAG;
    if (p.vy < 0 && !wetAt(cx, cy - 4)) p.vy *= SURFACE_DAMP;
    const s = Math.hypot(p.vx, p.vy); if (s > WATER_MAX) { p.vx *= WATER_MAX / s; p.vy *= WATER_MAX / s; }
    if (pressed.dolphin && p.abil.M && nearSurface(cx, cy)) {
      p.vy = -DOLPHIN_VY; p.vx = p.face * DOLPHIN_VX; p.dolph = true; p.water = false; splash(cx, cy, 3);
    }
    if (held.up) climb();
    if (wetAt(cx, cy) && t % 50 === 0) bubbles(cx + p.face * 3, cy - 2, 1);
    p.peak = p.y;
  } else {
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
    if (p.ground) {
      p.vx += clamp(dx * WALK_SPEED - p.vx, -WALK_ACCEL, WALK_ACCEL);
      if (pressed.stroke) { p.vy = -JUMP_VY; p.ground = false; }
    } else if (dx) p.vx = clamp(p.vx + dx * AIR_CONTROL, -Math.max(WALK_SPEED, Math.abs(p.vx)), Math.max(WALK_SPEED, Math.abs(p.vx)));
    if (p.ground) p.peak = p.y; else p.peak = Math.min(p.peak, p.y);
  }
  move(p);
  if (p.y > H * TILE) return die();
  // Ítems y meta: cualquier casilla que toque el nadador (con 2 px de margen)
  for (const [ex, ey] of [[-2, -2], [PW + 2, -2], [-2, PH + 2], [PW + 2, PH + 2]]) touchTile(T(p.x + ex), T(p.y + ey));
  // Meta: a dos casillas o menos de la bandera
  if (Math.abs(T(p.x + PW / 2) - goal.c) <= 2 && Math.abs(T(p.y + PH / 2) - goal.r) <= 1) { state = 'done'; UI.banner('¡META!', 'Tocá BRAZADA para jugar de nuevo', 0); }
}
function touchTile(c, r) {
  const p = P, ch = tileAt(c, r);
  if (ch === 'M') { p.abil.M = true; map[r][c] = wet[r][c] ? '~' : '.'; UI.banner('¡MARIPOSA!', 'DELFÍN (Z) cerca de la superficie: salto delfín'); UI.button('bDolphin', true); }
}
function move(p) {
  p.x += p.vx;
  if (hits(p.x, p.y)) { p.x = p.vx > 0 ? T(p.x + PW) * TILE - PW - .001 : (T(p.x) + 1) * TILE; if (!p.dolph) p.vx = 0; } // en el delfín conservás el impulso contra la red
  const wasGround = p.ground; p.ground = false;
  p.y += p.vy;
  if (hits(p.x, p.y)) {
    if (p.vy > 0) { p.y = T(p.y + PH) * TILE - PH - .001; p.ground = !p.water; } else p.y = (T(p.y) + 1) * TILE;
    p.vy = 0;
  }
  if (p.ground && !wasGround) { // aterrizaje: ¿caíste de muy alto?
    p.dolph = false;
    if (FALL_LIMIT && p.y - p.peak > FALL_LIMIT * TILE) die();
  }
}
function nearSurface(cx, cy) {
  for (let d = 0; d <= DOLPHIN_DEPTH + 4; d += 2) if (!wetAt(cx, cy - d)) return !solidAt(cx, cy - d);
  return false;
}
function climb() { // en la superficie, contra un borde de una casilla: subís
  const p = P, c = T(p.face > 0 ? p.x + PW + 1 : p.x - 1), r = T(p.y + PH / 2);
  if (tileAt(c, r) === '#' && !SOLID.includes(tileAt(c, r - 1)) && !wetAt(p.x + PW / 2, p.y - 2)) {
    Object.assign(p, { x: c * TILE + (TILE - PW) / 2, y: r * TILE - PH - .001, vx: 0, vy: 0, water: false, ground: true });
    p.peak = p.y; splash(p.x, p.y + PH, 1.5);
  }
}

// ---------- Partículas ----------
function bubbles(x, y, n) { for (let i = 0; i < n; i++) parts.push({ x: x + Math.random() * 4 - 2, y, vx: 0, vy: -.3 - Math.random() * .3, life: 90, b: 1 }); }
function splash(x, y, f) { for (let i = 0; i < 4 + f * 3; i++) parts.push({ x, y, vx: (Math.random() - .5) * f, vy: -Math.random() * f * .9, life: 40, b: 0 }); }
function updateParts() {
  parts = parts.filter(q => {
    q.x += q.vx + (q.b ? Math.sin((t + q.life) * .2) * .2 : 0); q.y += q.vy;
    if (!q.b) q.vy += .15;
    return --q.life > 0 && (q.b ? wetAt(q.x, q.y) : !wetAt(q.x, q.y) || q.vy < 0);
  });
}

// ---------- Dibujo ----------
const STAND = ['.hhhh.', 'hhhhhh', 'hsssse', '.sscss', '..ss..', '.ssss.', 'ssssss', 's.ss.s', 's.ss.s', '.mmmm.', '.mmmm.', '.s..s.', '.s..s.', '.s..s.'];
const WALK = ['.s..s.', 's....s', 's....s'];
const SWIM = [['..........hhh...', 'ss...mmmsssshhss', '.sssmmmmssssshe.', 'ss...mmm.sssscs.'],
              ['......ss..hhh...', 'ss...mmmsssshh..', '.sssmmmmssssshe.', 'ss...mmm.sssscs.']];
const COL = { h: 'hair', s: 'skin', e: 'eye', c: 'cheek', m: 'suit' };
function sprite(rows, x, y, flip) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    ctx.fillStyle = LOOK[COL[ch]];
    ctx.fillRect(Math.round(x + (flip ? row.length - 1 - i : i)), Math.round(y + j), 1, 1);
  }));
}
function drawPlayer() {
  const p = P, cx = p.x + PW / 2 - cam.x, by = p.y + PH - cam.y;
  if (p.water || p.dolph) sprite(SWIM[p.anim > 6 ? 1 : 0], cx - 8, by - 5, p.face < 0);
  else {
    const rows = p.ground && Math.abs(p.vx) > .3 && (t >> 3) % 2 ? STAND.slice(0, 11).concat(WALK) : STAND;
    sprite(rows, cx - 3, by - 14, p.face < 0);
  }
}
function drawTile(ch, c, r, x, y) {
  if (ch === '#') {
    ctx.fillStyle = '#d6e6ee'; ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = '#9fb9c8'; ctx.fillRect(x + 7, y, 1, 8); ctx.fillRect(x, y + 7, 8, 1);
    if (!SOLID.includes(tileAt(c, r - 1))) { ctx.fillStyle = '#3d7ea6'; ctx.fillRect(x, y, 8, 2); }
  } else if (ch === 'X') {
    ctx.fillStyle = '#c9d6dd';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 8 === 0 || (i - j + 8) % 8 === 0) ctx.fillRect(x + i, y + j, 1, 1);
    if (tileAt(c, r - 1) !== 'X') { ctx.fillStyle = (c % 2) ? '#d33' : '#fff'; ctx.fillRect(x, y, 8, 3); }
  } else if (ch === 'B') {
    ctx.fillStyle = 'rgba(200,240,255,.55)'; ctx.fillRect(x + 1, y + 1, 6, 6); ctx.fillRect(x, y + 3, 8, 3);
  } else if (ch === 'M') {
    const b = Math.sin(t * .1) * 1.5, g = 150 + Math.sin(t * .2) * 100;
    ctx.fillStyle = `rgb(255,${g | 0},60)`; ctx.fillRect(x + 1, y + 2 + b, 6, 4); ctx.fillRect(x + 2, y + 1 + b, 4, 6);
    ctx.fillStyle = '#7a3ccf'; ctx.fillRect(x + 2, y + 3 + b, 1, 2); ctx.fillRect(x + 5, y + 3 + b, 1, 2); ctx.fillRect(x + 3, y + 4 + b, 2, 1);
  } else if (ch === 'F') {
    ctx.fillStyle = '#888'; ctx.fillRect(x + 1, y - 8, 1, 16);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(x + 2 + i, y - 8 + j, 1, 1); }
  }
}
function draw() {
  const p = P;
  cam.x += (clamp(p.x - VW / 2, 0, W * TILE - VW) - cam.x) * .15;
  cam.y += (clamp(p.y - VH / 2, 0, H * TILE - VH) - cam.y) * .15;
  const sx = cam.shake ? (Math.random() - .5) * cam.shake : 0; if (cam.shake) cam.shake *= .85, cam.shake < .3 && (cam.shake = 0);
  ctx.save(); ctx.translate(Math.round(sx), 0);
  ctx.fillStyle = '#1c2b44'; ctx.fillRect(0, 0, VW, VH);
  const ox = Math.floor(cam.x), oy = Math.floor(cam.y), c0 = T(ox), r0 = T(oy);
  for (let r = r0; r <= r0 + 23; r++) for (let c = c0; c <= c0 + 41; c++) drawTile(tileAt(c, r), c, r, c * 8 - ox, r * 8 - oy);
  if (!p.dead || t % 6 < 3) drawPlayer();
  // agua por encima del nadador: así se ve sumergido
  for (let r = r0; r <= r0 + 23; r++) for (let c = c0; c <= c0 + 41; c++) {
    if (r < 0 || r >= H || c < 0 || c >= W || !wet[r][c]) continue;
    const x = c * 8 - ox, y = r * 8 - oy;
    ctx.fillStyle = 'rgba(30,120,200,.5)'; ctx.fillRect(x, y, 8, 8);
    if (!wet[r - 1]?.[c] && !SOLID.includes(tileAt(c, r - 1))) { ctx.fillStyle = '#9fdcff'; ctx.fillRect(x, y + Math.round(Math.sin(t * .08 + c) * .8), 8, 1); }
  }
  for (const q of parts) { ctx.fillStyle = q.b ? 'rgba(220,245,255,.8)' : '#bfe8ff'; ctx.fillRect(Math.round(q.x - ox), Math.round(q.y - oy), 1, 1); }
  if (p.dead) { ctx.fillStyle = `rgba(200,30,30,${p.dead / 120})`; ctx.fillRect(0, 0, VW, VH); }
  ctx.restore();
  const h = L.hints.filter(([c, , k]) => T(p.x) >= c && (!k || (k[0] === '!') !== !!p.abil[k.slice(-1)])).pop();
  UI.hint(h ? h[1] : '');
}

// ---------- Bucle (60 cuadros por segundo fijos) ----------
function fit() { const s = Math.min(innerWidth / VW, innerHeight / VH); cv.style.width = VW * s + 'px'; cv.style.height = VH * s + 'px'; }
addEventListener('resize', fit); fit();
let last = performance.now(), acc = 0;
function frame(now) {
  acc = Math.min(acc + now - last, 100); last = now;
  while (acc >= 1000 / 60) { update(); updateParts(); acc -= 1000 / 60; }
  draw(); requestAnimationFrame(frame);
}
loadLevel(0); requestAnimationFrame(frame);
