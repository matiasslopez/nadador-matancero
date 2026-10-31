'use strict';
// Menús, HUD y carteles (texto en HTML encima del canvas).
const $ = id => document.getElementById(id);
const UI = {
  // Cartel grande al centro; ms = 0 lo deja fijo hasta el próximo cartel.
  banner(title, sub, ms = 2800) {
    const b = $('banner');
    b.innerHTML = `<h1>${title}</h1><p>${sub}</p>`; b.style.display = 'block';
    clearTimeout(this.bt); if (ms) this.bt = setTimeout(() => b.style.display = 'none', ms);
  },
  clear() { $('banner').style.display = 'none'; },
  hint(text) { if (text !== this.last) $('hint').textContent = this.last = text; },
  button(id, on) { $(id).style.display = on ? '' : 'none'; },
  clock(f) { const s = f / 60; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; },
  // HUD: vidas, medallas, laps, cronómetro, estilos y barra de aire
  hud(p, styles, blink) {
    const top = `♥ ${p.lives}  ● ${p.medals}  ⟲ ${p.laps}  ⏱ ${this.clock(p.time)}`;
    if (top !== this.lt) $('stats').textContent = this.lt = top;
    if (styles !== this.ls) $('styles').textContent = this.ls = styles;
    $('airfill').style.width = p.air * 100 + '%';
    $('airfill').style.background = blink ? '#ff4d4d' : p.air < .3 ? '#ffb13b' : '#7fdcff';
  },
};
