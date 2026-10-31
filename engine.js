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
// --- Subacuático (Sumergir) ---
const DIVE_IMPULSE = 2.8;    // empujón hacia abajo al tocar Sumergir
const DIVE_SINK = 0.08;      // mientras mantenés Sumergir, en vez de flotar te hundís con esta fuerza
// --- Aire ---
const AIR_TIME = 5;        // segundos que aguantás bajo el agua
const AIR_REFILL = 0.5;      // segundos para llenar la barra al respirar
const AIR_WARN = 0.3;        // con menos de esta parte de la barra, titila
// --- Fuera del agua ---
const GRAVITY = 0.25;        // gravedad: pesás
const MAX_FALL = 5;          // velocidad máxima de caída
const WALK_SPEED = 1.5;      // velocidad caminando
const WALK_ACCEL = 0.3;      // qué tan rápido arrancás y frenás al caminar
const AIR_CONTROL = 0.15;    // cuánto podés corregir en el aire
const JUMP_VY = 3.6;         // fuerza del salto en tierra (~3 casillas de alto)
const COYOTE = 6;            // cuadros en que todavía podés saltar después de pisar el vacío
// --- Mariposa ---
const DOLPHIN_VY = 2.8;      // salto delfín: fuerza hacia arriba (~2 casillas)
const DOLPHIN_VX = 2.0;      // salto delfín: fuerza hacia adelante
const DOLPHIN_DEPTH = 10;    // píxeles bajo la superficie desde donde todavía podés hacer el delfín
// --- Vidas, medallas, lap ---
const LIVES = 3;             // vidas al empezar el nivel
const MEDALS_FOR_LIFE = 50;  // medallas para una vida extra
const LAP_SECONDS = 3;       // cuánto rebobina el lap
const LAP_USES = 3;          // usos de lap por nivel
const LAP_SPEED = 2;         // cuadros rebobinados por cuadro (2 = el doble de rápido)
// ============================================================================

const PW = 6, PH = 6, SOLID = '#X';
const LOOK = { skin: '#E8B48A', hair: '#F0CC62', suit: '#2E8B57', cheek: '#E06666', eye: '#222' }; // Mati
const ABIL = { U: 'SUBACUÁTICO', M: 'MARIPOSA' };

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
let L, lvl, map, wet, W, H, P, start, goal, state, t = 0, parts = [], cam = { x: 0, y: 0, shake: 0 }, buf = [];

// ---------- Nivel ----------
function loadLevel(i) {
  lvl = i; L = LEVELS[i]; map = L.map.map(r => r.split('')); H = map.length; W = map[0].length;
  const isW = (c, r) => '~B'.includes(tileAt(c, r));
  wet = map.map((row, r) => row.map((ch, c) => '~B'.includes(ch) ||
    ('MEPUCFSo=^X'.includes(ch) && (isW(c, r - 1) || isW(c, r + 1) || (isW(c - 1, r) && isW(c + 1, r))))));
  map.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'S') start = spot(c, r); if (ch === 'F') goal = { c, r }; }));
  P = { abil: {}, lives: LIVES, medals: 0, laps: LAP_USES, time: 0, deaths: 0 };
  state = 'play'; respawn(); UI.button('bDolphin', false); UI.button('bDive', false); UI.clear();
}
const spot = (c, r) => ({ x: c * TILE + 1, y: r * TILE + TILE - PH - 0.01 });
function tileAt(c, r) { return c < 0 || c >= W ? '#' : r < 0 || r >= H ? '.' : map[r][c]; }
const T = v => Math.floor(v / TILE);
const solidAt = (x, y) => SOLID.includes(tileAt(T(x), T(y)));
const wetAt = (x, y) => y >= 0 && x >= 0 && T(x) < W && T(y) < H && wet[T(y)][T(x)];
const hits = (x, y) => solidAt(x, y) || solidAt(x + PW - .01, y) || solidAt(x, y + PH - .01) || solidAt(x + PW - .01, y + PH - .01);

function respawn() {
  Object.assign(P, { x: start.x, y: start.y, vx: 0, vy: 0, face: 1, water: false, ground: false, coyote: 0, cd: 0, anim: 0, dead: 0, dolph: false, air: 1 });
  buf = [];
}
function die() { if (!P.dead) { P.dead = 50; cam.shake = 6; } }
function afterDeath() { // termina la animación: se descuenta la vida
  P.deaths++;
  if (--P.lives > 0) return respawn();
  loadLevel(lvl); UI.banner('SIN VIDAS', 'El nivel arranca de cero');
}

// ---------- Input (teclado + táctil) ----------
const ACTIONS = ['left', 'right', 'up', 'down', 'stroke', 'dolphin', 'dive', 'lap'];
const held = {}, queue = {}, pressed = {}, keyHeld = {}, touchHeld = {};
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'stroke', z: 'dolphin', a: 'dive', x: 'lap' };
const keyOf = e => KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
addEventListener('keydown', e => { const k = keyOf(e); if (!k) return; e.preventDefault(); if (!e.repeat) queue[k] = true; keyHeld[k] = true; });
addEventListener('keyup', e => { const k = keyOf(e); if (k) keyHeld[k] = false; });
function readInput() { for (const k of ACTIONS) { held[k] = keyHeld[k] || touchHeld[k]; pressed[k] = queue[k]; queue[k] = false; } }
// Táctil: cada dedo se asigna a la cruz o a un botón al apoyarlo; varios dedos a la vez.
const touches = {};
function zoneAt(x, y) {
  for (const id of ['bStroke', 'bDolphin', 'bDive', 'bLap']) {
    const el = document.getElementById(id); if (el.style.display === 'none') continue;
    const b = el.getBoundingClientRect(), m = b.width * .12;
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
  for (const k of ACTIONS) { if (live[k] && !touchHeld[k]) queue[k] = true; touchHeld[k] = !!live[k]; }
}
for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(ev, onTouch, { passive: false });

// ---------- Física ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function update() {
  readInput(); t++;
  const p = P;
  if (state === 'done') { if (pressed.stroke) loadLevel(lvl); return; }
  if (pressed.lap && p.laps && buf.length > 20 && state === 'play') { state = 'rewind'; p.laps--; p.dead = 0; UI.banner('⟲ LAP', '', 900); }
  if (state === 'rewind') { // las arenas del tiempo, versión pileta
    for (let i = 0; i < LAP_SPEED && buf.length; i++) [p.x, p.y, p.vx, p.vy, p.water, p.face, p.dolph, p.air] = buf.pop();
    if (!buf.length) state = 'play';
    return;
  }
  if (p.dead) { if (--p.dead === 0) afterDeath(); return; }
  p.time++;
  buf.push([p.x, p.y, p.vx, p.vy, p.water, p.face, p.dolph, p.air]); if (buf.length > LAP_SECONDS * 60) buf.shift();
  const cx = p.x + PW / 2, cy = p.y + PH / 2;
  const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0), dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  if (dx) p.face = dx;
  if (p.cd) p.cd--;
  if (p.anim) p.anim--;
  const was = p.water;
  p.water = !(p.dolph && p.vy < 0) && wetAt(cx, cy + 3); // agua hasta 3 px sobre la superficie (así flotás), salvo subiendo en el delfín
  if (p.water !== was) { if (Math.abs(p.vy) > .8) splash(cx, cy, Math.abs(p.vy)); if (p.water) { p.vy *= ENTRY_DAMP; p.vx *= .6; p.dolph = false; } }

  if (p.water) {
    const diving = p.abil.U && held.dive;
    p.vy += WATER_GRAVITY + (diving ? DIVE_SINK : wetAt(cx, cy) ? -BUOYANCY : 0);
    p.vx += dx * ARROW_KICK; p.vy += dy * ARROW_KICK;
    if (pressed.stroke && !p.cd) {
      const ix = dx || dy ? dx : p.face, iy = dy, n = Math.hypot(ix, iy);
      p.vx += ix / n * STROKE_IMPULSE; p.vy += iy / n * STROKE_IMPULSE;
      p.cd = STROKE_COOLDOWN; p.anim = 12; bubbles(cx, cy, 3);
    }
    if (pressed.dive && p.abil.U) { p.vy = Math.max(p.vy, 0) + DIVE_IMPULSE; p.anim = 12; bubbles(cx, cy, 5); }
    p.vx *= WATER_DRAG; p.vy *= WATER_DRAG;
    if (p.vy < 0 && !wetAt(cx, cy - 4)) p.vy *= SURFACE_DAMP;
    const s = Math.hypot(p.vx, p.vy); if (s > WATER_MAX) { p.vx *= WATER_MAX / s; p.vy *= WATER_MAX / s; }
    if (pressed.dolphin && p.abil.M && nearSurface(cx, cy)) {
      p.vy = -DOLPHIN_VY; p.vx = p.face * DOLPHIN_VX; p.dolph = true; p.water = false; splash(cx, cy, 3);
    }
    if (held.up) climb();
    if (wetAt(cx, cy) && t % 50 === 0) bubbles(cx + p.face * 3, cy - 2, 1);
  } else {
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
    p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - 1);
    if (p.ground) p.vx += clamp(dx * WALK_SPEED - p.vx, -WALK_ACCEL, WALK_ACCEL);
    else if (dx) p.vx = clamp(p.vx + dx * AIR_CONTROL, -Math.max(WALK_SPEED, Math.abs(p.vx)), Math.max(WALK_SPEED, Math.abs(p.vx)));
    if (pressed.stroke && p.coyote) { p.vy = -JUMP_VY; p.ground = false; p.coyote = 0; }
  }
  // Aire: baja con la cabeza bajo el agua, se llena al asomar o en un bolsón
  const head = p.y - 1;
  const breathe = tileAt(T(cx), T(head)) === 'B' || !(wetAt(cx, head) || solidAt(cx, head));
  if (!breathe) { p.air -= 1 / (AIR_TIME * 60); if (p.air <= 0) { p.air = 0; return die(); } }
  else p.air = Math.min(1, p.air + 1 / (AIR_REFILL * 60));
  move(p);
  if (p.y > H * TILE + 16) return die();
  // Ítems: cualquier casilla que toque el nadador (con 2 px de margen)
  for (let r = T(p.y - 2); r <= T(p.y + PH + 2); r++) for (let c = T(p.x - 2); c <= T(p.x + PW + 2); c++) touchTile(c, r);
  // Meta: a dos casillas o menos de la bandera
  if (Math.abs(T(p.x + PW / 2) - goal.c) <= 2 && Math.abs(T(p.y + PH / 2) - goal.r) <= 1) {
    state = 'done';
    UI.banner('¡META!', `Tiempo ${UI.clock(p.time)} · Medallas ${p.medals}<br>Tocá BRAZADA para jugar de nuevo`, 0);
  }
}
function touchTile(c, r) {
  const p = P, ch = tileAt(c, r), clear = () => map[r][c] = wet[r][c] ? '~' : '.';
  if (ch === 'o') {
    clear(); sparkle(c * TILE + 4, r * TILE + 4);
    if (++p.medals % MEDALS_FOR_LIFE === 0) { p.lives++; UI.banner('¡VIDA EXTRA!', `${p.medals} medallas`); }
  } else if (ch === 'U') {
    clear(); p.abil.U = true; UI.button('bDive', true);
    UI.banner('¡SUBACUÁTICO!', 'SUMERGIR (A): te tirás para abajo. Mantenelo para quedarte en el fondo');
  } else if (ch === 'M') {
    clear(); p.abil.M = true; UI.button('bDolphin', true);
    UI.banner('¡MARIPOSA!', 'DELFÍN (Z) en la superficie: saltito para pasar boyas y agarrar medallas de arriba');
  } else if (ch === 'C' && (start.c !== c || start.r !== r)) {
    start = Object.assign(spot(c, r), { c, r }); UI.banner('CHECKPOINT', '', 1200);
  }
}
function move(p) {
  p.x += p.vx;
  if (hits(p.x, p.y)) { p.x = p.vx > 0 ? T(p.x + PW) * TILE - PW - .001 : (T(p.x) + 1) * TILE; if (!p.dolph) p.vx = 0; } // en el delfín conservás el impulso contra la boya
  p.ground = false;
  p.y += p.vy;
  if (hits(p.x, p.y)) {
    if (p.vy > 0) { p.y = T(p.y + PH) * TILE - PH - .001; p.ground = !p.water; p.dolph = false; } else p.y = (T(p.y) + 1) * TILE;
    p.vy = 0;
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
    splash(p.x, p.y + PH, 1.5);
  }
}

// ---------- Partículas ----------
function bubbles(x, y, n) { for (let i = 0; i < n; i++) parts.push({ x: x + Math.random() * 4 - 2, y, vx: 0, vy: -.3 - Math.random() * .3, life: 90, b: 1 }); }
function splash(x, y, f) { for (let i = 0; i < 4 + f * 3; i++) parts.push({ x, y, vx: (Math.random() - .5) * f, vy: -Math.random() * f * .9, life: 40, b: 0 }); }
function sparkle(x, y) { for (let i = 0; i < 6; i++) parts.push({ x, y, vx: Math.cos(i) * .8, vy: Math.sin(i) * .8, life: 18, s: 1 }); }
function updateParts() {
  parts = parts.filter(q => {
    q.x += q.vx + (q.b ? Math.sin((t + q.life) * .2) * .2 : 0); q.y += q.vy;
    if (q.s) return --q.life > 0;
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
function token(x, y, a, b) { // ítem de estilo: ficha que brilla
  const o = Math.sin(t * .1) * 1.5;
  ctx.fillStyle = a; ctx.fillRect(x + 1, y + 2 + o, 6, 4); ctx.fillRect(x + 2, y + 1 + o, 4, 6);
  ctx.fillStyle = b; ctx.fillRect(x + 3, y + 2 + o, 2, 4);
}
function drawTile(ch, c, r, x, y) {
  if (ch === '#') {
    ctx.fillStyle = '#d6e6ee'; ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = '#9fb9c8'; ctx.fillRect(x + 7, y, 1, 8); ctx.fillRect(x, y + 7, 8, 1);
    if (!SOLID.includes(tileAt(c, r - 1))) { ctx.fillStyle = '#3d7ea6'; ctx.fillRect(x, y, 8, 2); }
  } else if (ch === 'X') {
    if (tileAt(c, r - 1) !== 'X') { // boya
      ctx.fillStyle = '#e33'; ctx.fillRect(x + 1, y + 1, 6, 7); ctx.fillRect(x, y + 2, 8, 5);
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y + 4, 8, 2); ctx.fillStyle = '#ff9c9c'; ctx.fillRect(x + 2, y + 2, 1, 1);
    } else { // red bajo la boya
      ctx.fillStyle = '#c9d6dd';
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 8 === 0 || (i - j + 8) % 8 === 0) ctx.fillRect(x + i, y + j, 1, 1);
    }
  } else if (ch === 'B') {
    ctx.fillStyle = 'rgba(200,240,255,.55)'; ctx.fillRect(x + 1, y + 1, 6, 6); ctx.fillRect(x, y + 3, 8, 3);
  } else if (ch === 'o') { // medalla
    const w = [4, 3, 1, 3][(t >> 3) % 4], o = (4 - w) / 2 + 2;
    ctx.fillStyle = '#f4c430'; ctx.fillRect(x + o, y + 1, w, 6); ctx.fillRect(x + o - (w > 1), y + 2, w + 2 * (w > 1), 4);
    ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + o, y + 2, 1, 2);
  } else if (ch === '=') { // banderines colgados sobre el borde
    ctx.fillStyle = '#ddd'; ctx.fillRect(x, y + 1, 8, 1);
    ctx.fillStyle = c % 2 ? '#e33' : '#ffe066'; ctx.fillRect(x + 1, y + 2, 5, 1); ctx.fillRect(x + 2, y + 3, 3, 1); ctx.fillRect(x + 3, y + 4, 1, 1);
  } else if (ch === 'U') token(x, y, '#4dd0e1', '#0b4f6c');
  else if (ch === 'M') token(x, y, '#ffb13b', '#7a3ccf');
  else if (ch === 'C') {
    const on = start.c === c && start.r === r;
    ctx.fillStyle = '#888'; ctx.fillRect(x + 1, y - 8, 1, 16);
    ctx.fillStyle = on ? '#4caf50' : '#666'; ctx.fillRect(x + 2, y - 8 + (on ? 0 : 6), 5, 4);
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
  for (const q of parts) { ctx.fillStyle = q.s ? '#fff3a0' : q.b ? 'rgba(220,245,255,.8)' : '#bfe8ff'; ctx.fillRect(Math.round(q.x - ox), Math.round(q.y - oy), 1, 1); }
  if (p.dead) { ctx.fillStyle = `rgba(200,30,30,${p.dead / 120})`; ctx.fillRect(0, 0, VW, VH); }
  if (state === 'rewind') { ctx.fillStyle = 'rgba(255,210,120,.18)'; ctx.fillRect(0, 0, VW, VH); }
  ctx.restore();
  const h = L.hints.filter(([c, , k]) => T(p.x) >= c && (!k || (k[0] === '!') !== !!p.abil[k.slice(-1)])).pop();
  UI.hint(h ? h[1] : '');
  UI.hud(p, ['CROL', ...Object.keys(ABIL).filter(k => p.abil[k]).map(k => ABIL[k])].join(' · '), p.air < AIR_WARN && t % 20 < 10);
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
