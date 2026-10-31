'use strict';
// Menús, HUD y carteles (texto en HTML encima del canvas).
const UI = {
  // Cartel grande al centro; ms = 0 lo deja fijo hasta el próximo cartel.
  banner(title, sub, ms = 2800) {
    const b = document.getElementById('banner');
    b.innerHTML = `<h1>${title}</h1><p>${sub}</p>`; b.style.display = 'block';
    clearTimeout(this.bt); if (ms) this.bt = setTimeout(() => b.style.display = 'none', ms);
  },
  clear() { document.getElementById('banner').style.display = 'none'; },
  hint(text) { if (text !== this.last) document.getElementById('hint').textContent = this.last = text; },
  button(id, on) { document.getElementById(id).style.display = on ? '' : 'none'; },
};
