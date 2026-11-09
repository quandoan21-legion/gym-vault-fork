'use strict';
/* A small floating tooltip for the activity graph + heatmap: a dark rounded
   card anchored above (or below) the tapped point, with a dim title line and a
   row of [swatch] label … value. Positioned in pixels relative to `wrap`
   (which is made position:relative). Colours via CSS vars so it follows skins.
   pointer-events:none so it never blocks the next tap. */

const { el } = require('./dom');

function attachTip(wrap) {
  if (!wrap.style.position) wrap.style.position = 'relative';
  const tip = el('div', {
    style: 'position:absolute; z-index:6; pointer-events:none; display:none; '
      + 'background:var(--gv-surface); border:1px solid var(--gv-line); border-radius:6px; '
      + 'padding:8px 10px; box-shadow:0 6px 18px rgba(0,0,0,0.35); min-width:120px; '
      + 'white-space:nowrap; opacity:0; transition:opacity 0.12s ease;',
  });
  wrap.appendChild(tip);

  function show(anchorEl, data) {
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    tip.appendChild(el('div', { style: 'font-size:11px; color:var(--gv-ink-dim); margin-bottom:5px;' }, data.title || ''));
    const row = el('div', { style: 'display:flex; align-items:center; gap:8px;' });
    row.appendChild(el('span', { style: 'width:11px; height:11px; border-radius:2px; flex:0 0 auto; background:var(--gv-accent-line, var(--gv-lime));' }));
    row.appendChild(el('span', { style: 'font-size:12px; color:var(--gv-ink);' }, data.label || ''));
    row.appendChild(el('span', { style: 'font-size:13px; font-weight:700; margin-left:18px; color:var(--gv-ink);' }, data.value || ''));
    tip.appendChild(row);

    tip.style.display = 'block';
    const wr = wrap.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    let left = (ar.left - wr.left) + ar.width / 2 - tip.offsetWidth / 2;
    left = Math.max(2, Math.min(left, wrap.clientWidth - tip.offsetWidth - 2));
    let top = (ar.top - wr.top) - tip.offsetHeight - 8;
    if (top < 0) top = (ar.top - wr.top) + ar.height + 8;   // flip below if no room above
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.opacity = '1';
  }

  function hide() { tip.style.opacity = '0'; tip.style.display = 'none'; }

  return { show, hide };
}

module.exports = { attachTip };
