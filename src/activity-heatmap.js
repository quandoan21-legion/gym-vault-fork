'use strict';
/* A full-width activity heatmap: `weeks` columns × 7 rows, newest week last.
   Cells stretch to fill the row (no fixed px / horizontal scroll). Tapping a
   cell shows that day's figure in an info line below (mobile-friendly).
   Shared by Reading / Chess / Focus. Reuses the app's gv-heat-cell classes
   (on/off/future/today) for colour, so it follows every skin; intensity is an
   inline opacity from `levels(value)`. */

const { el } = require('./dom');
const { attachTip } = require('./viz-tip');
const { startOfWeek, addDays } = require('./dates');

function activityHeatmap(host, byDay, opts) {
  opts = opts || {};
  byDay = byDay || {};
  const weeks = opts.weeks || 18;
  const unit = opts.unit || '';
  const today = opts.today;
  const levels = opts.levels || (v => (v >= 45 ? 1 : v >= 30 ? 0.8 : v >= 15 ? 0.6 : 0.4));
  const caption = opts.caption || '';
  const label = opts.label || 'Activity';

  const wrap = el('div', {});
  const grid = el('div', { class: 'gv-heat', style: 'display:flex; gap:3px; width:100%; min-width:0;' });
  const info = el('div', { class: 'gv-dim', style: 'font-size:12px; margin-top:6px;' }, caption);
  const tip = attachTip(wrap);

  let selected = null;
  const thisWeek = startOfWeek(today, opts.weekStart);
  for (let w = weeks - 1; w >= 0; w--) {
    const col = el('div', { class: 'gv-heat-col', style: 'flex:1 1 0; min-width:0; gap:3px;' });
    const ws = addDays(thisWeek, -7 * w);
    for (let d = 0; d < 7; d++) {
      const iso = addDays(ws, d);
      const v = byDay[iso] || 0;
      const future = iso > today;
      const cls = future ? 'future' : v ? 'on' : 'off';
      const cell = el('div', {
        class: `gv-heat-cell ${cls}${iso === today ? ' today' : ''}`,
        style: 'width:100%; height:auto; aspect-ratio:1;' + (future ? '' : ' cursor:pointer;'),
      });
      if (v) cell.style.opacity = String(levels(v));
      if (!future) {
        cell.onclick = (ev) => {
          if (ev) ev.stopPropagation();
          if (selected) { selected.style.outline = ''; selected.style.outlineOffset = ''; }
          selected = cell;
          cell.style.outline = '2px solid var(--gv-accent-line, var(--gv-lime))';
          cell.style.outlineOffset = '1px';
          tip.show(cell, { title: iso, label, value: `${Math.round(v)}${unit ? ' ' + unit : ''}` });
        };
      }
      col.appendChild(cell);
    }
    grid.appendChild(col);
  }

  wrap.appendChild(grid);
  wrap.appendChild(info);
  host.appendChild(wrap);
  return wrap;
}

module.exports = { activityHeatmap };
