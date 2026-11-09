'use strict';
/* A per-month line graph: X/Y axes with arrowheads, horizontal gridlines,
   value markers, draw-in animation on every month change, and a tap-a-marker
   tooltip. Shared by Reading / Chess / Focus / Gym.

   Two call shapes (backward compatible):
     monthGraph(host, byDay, { unit, ariaName, label })          // fixed series
     monthGraph(host, null,  { ariaName, label, metrics, filters, compute })
   In the second shape the graph renders controls — metric chips + filter
   dropdowns — and calls compute(metricKey, filterSel) → byDay whenever a
   control changes, redrawing the SAME chart (month nav + animation + tooltip).
   Pure DOM + inline SVG; colours via CSS vars so it follows every skin. */

const { el, ico } = require('./dom');
const { attachTip } = require('./viz-tip');

const raf = (typeof window !== 'undefined' && window.requestAnimationFrame)
  ? window.requestAnimationFrame.bind(window)
  : (fn => setTimeout(fn, 16));

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs) => {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

function niceCeil(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* A themed dropdown (native <select> popups can't follow the dark skin).
   Button shows the current label; a styled, scrollable popup lists options. */
function buildDropdown(options, value, onPick) {
  const wrap = el('div', { style: 'position:relative; display:inline-block;' });
  const cur = options.find(o => o.value === value) || options[0];
  const labelSpan = el('span', { style: 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' }, cur ? cur.label : '');
  const btn = el('button', { type: 'button', class: 'gv-chip', style: 'display:inline-flex; align-items:center; gap:6px; max-width:180px;' }, labelSpan, ico('chevron-down'));
  const pop = el('div', { style: 'position:absolute; z-index:20; top:100%; left:0; margin-top:4px; min-width:100%; width:max-content; max-width:280px; max-height:260px; overflow:auto; background:var(--gv-surface); border:1px solid var(--gv-line); border-radius:6px; box-shadow:0 8px 22px rgba(0,0,0,0.4); padding:4px; display:none;' });

  let open = false, docHandler = null;
  function close() { open = false; pop.style.display = 'none'; if (docHandler) { document.removeEventListener('click', docHandler, true); docHandler = null; } }
  function openPop() { open = true; pop.style.display = 'block'; docHandler = ev => { if (!wrap.contains(ev.target)) close(); }; setTimeout(() => document.addEventListener('click', docHandler, true), 0); }

  const mark = (it, on) => { it.dataset.sel = on ? '1' : ''; it.style.background = on ? 'var(--gv-accent-line, var(--gv-lime))' : ''; it.style.color = on ? 'var(--gv-ink-fixed, #141a0e)' : 'var(--gv-ink)'; };
  options.forEach(o => {
    const it = el('div', { style: 'padding:6px 8px; font-size:12px; border-radius:4px; cursor:pointer; white-space:normal; line-height:1.3;' }, o.label);
    mark(it, o.value === value);
    it.onmouseenter = () => { if (it.dataset.sel !== '1') it.style.background = 'var(--gv-lime-ghost)'; };
    it.onmouseleave = () => { if (it.dataset.sel !== '1') it.style.background = ''; };
    it.onclick = ev => { ev.stopPropagation(); [...pop.children].forEach(ch => mark(ch, false)); mark(it, true); labelSpan.textContent = o.label; close(); onPick(o.value); };
    pop.append(it);
  });
  btn.onclick = ev => { ev.stopPropagation(); open ? close() : openPop(); };
  wrap.append(btn, pop);
  return wrap;
}

function monthGraph(host, byDay, opts) {
  opts = opts || {};
  const name = opts.ariaName || 'Activity';
  const metrics = (opts.metrics && opts.metrics.length) ? opts.metrics : null;
  const filters = opts.filters || null;
  const baseByDay = byDay || {};

  let mi = 0;                         // selected metric index
  const sel = {};                    // selected filter values (key -> value)
  let offset = 0;                    // 0 = current month
  let maxOffset = 0;                 // recomputed from the current series
  const now = new Date();

  const wrap = el('div', { class: 'gv-graph' });

  /* ---- controls (only in the metrics/filters shape) ---- */
  const metricChips = [];
  if (metrics || filters) {
    /* one flex row, every control the same gv-chip component, so metric chips
       and filter dropdowns share a height/baseline (no misalignment). */
    const controls = el('div', { style: 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:8px;' });
    if (metrics) metrics.forEach((m, idx) => {
      const b = el('button', { class: 'gv-chip' + (idx === 0 ? ' on' : ''), type: 'button' }, m.label);
      b.onclick = () => { mi = idx; metricChips.forEach((x, j) => x.classList.toggle('on', j === mi)); render(); };
      metricChips.push(b);
      controls.append(b);
    });
    if (filters) for (const f of filters) controls.append(buildDropdown(f.options, '', v => { sel[f.key] = v; render(); }));
    wrap.append(controls);
  }

  const nav = el('div', { style: 'display:flex; align-items:center; gap:10px; margin:2px 0 8px;' });
  const prev = el('button', { class: 'gv-btn gv-btn-ghost gv-btn-small', type: 'button', 'aria-label': 'Previous month' }, ico('chevron-left'));
  const lbl = el('span', { style: 'font-weight:700; min-width:160px; text-align:center;' });
  const next = el('button', { class: 'gv-btn gv-btn-ghost gv-btn-small', type: 'button', 'aria-label': 'Next month' }, ico('chevron-right'));
  nav.append(prev, lbl, next);
  const canvas = el('div', {});
  wrap.append(nav, canvas);
  host.append(wrap);
  const tip = attachTip(wrap);

  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function render() {
    clearNode(canvas);
    tip.hide();

    const unit = metrics ? metrics[mi].unit : (opts.unit || '');
    const curLabel = metrics ? metrics[mi].label : (opts.label || name);
    const data = opts.compute ? (opts.compute(metrics[mi].key, Object.assign({}, sel)) || {}) : baseByDay;

    const keys = Object.keys(data).sort();
    maxOffset = 0;
    if (keys.length) {
      const e = keys[0].split('-');
      maxOffset = (now.getFullYear() - +e[0]) * 12 + (now.getMonth() - (+e[1] - 1));
      if (maxOffset < 0) maxOffset = 0;
    }
    if (offset > maxOffset) offset = maxOffset;
    if (offset < 0) offset = 0;

    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear(), mo = d.getMonth();
    const pfx = `${y}-${String(mo + 1).padStart(2, '0')}`;
    const days = new Date(y, mo + 1, 0).getDate();

    const pts = [];
    let total = 0, nvals = 0;
    for (let day = 1; day <= days; day++) {
      const ds = `${pfx}-${String(day).padStart(2, '0')}`;
      const has = Object.prototype.hasOwnProperty.call(data, ds);
      const value = has ? data[ds] : 0;
      if (has) { total += value; nvals++; }
      pts.push({ day, value, has });
    }
    lbl.textContent = `${pfx}  (${Math.round(total)}${unit ? ' ' + unit : ''})`;
    prev.disabled = offset >= maxOffset;
    next.disabled = offset <= 0;

    const W = 320, H = 192, padL = 32, padR = 12, padT = 12, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const top = niceCeil(pts.reduce((m, p) => Math.max(m, p.value), 0));
    const xAt = i => padL + (days === 1 ? 0 : (i / (days - 1)) * plotW);
    const yAt = v => padT + plotH - (v / top) * plotH;

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gv-graph-svg', role: 'img', 'aria-label': `${name}, ${pfx}` });
    svg.setAttribute('style', 'width:100%; height:auto; display:block; overflow:visible;');

    for (let t = 0; t <= 4; t++) {
      const v = top * t / 4;
      const yy = yAt(v);
      svg.appendChild(svgEl('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, stroke: 'var(--gv-line)', 'stroke-width': 1, 'stroke-dasharray': t ? '2 3' : '0' }));
      const tx = svgEl('text', { x: padL - 5, y: yy + 3, 'text-anchor': 'end', fill: 'var(--gv-ink-dim)', 'font-size': 8 });
      tx.textContent = String(Math.round(v));
      svg.appendChild(tx);
    }
    for (let day = 1; day <= days; day++) {
      if (day !== 1 && day % 5 !== 0) continue;
      const tx = svgEl('text', { x: xAt(day - 1), y: H - padB + 12, 'text-anchor': 'middle', fill: 'var(--gv-ink-dim)', 'font-size': 8 });
      tx.textContent = String(day);
      svg.appendChild(tx);
    }
    const ax = { stroke: 'var(--gv-ink-dim)', 'stroke-width': 1.2 };
    svg.appendChild(svgEl('line', Object.assign({ x1: padL, y1: padT - 2, x2: padL, y2: H - padB }, ax)));
    svg.appendChild(svgEl('line', Object.assign({ x1: padL, y1: H - padB, x2: W - padR + 2, y2: H - padB }, ax)));
    svg.appendChild(svgEl('path', { d: `M${padL},${padT - 7} l-3,6 h6 z`, fill: 'var(--gv-ink-dim)' }));
    svg.appendChild(svgEl('path', { d: `M${W - padR + 7},${H - padB} l-6,-3 v6 z`, fill: 'var(--gv-ink-dim)' }));

    /* connect only days that have data, so a rest day / no-game day is a gap,
       not a plunge to zero (matters for Elo, max-weight, …). */
    const present = pts.filter(p => p.has);
    const px = p => xAt(p.day - 1);
    const py = p => yAt(p.value);
    const dstr = present.map((p, i) => `${i ? 'L' : 'M'}${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
    const path = svgEl('path', { d: dstr, fill: 'none', stroke: 'var(--gv-accent-line, var(--gv-lime))', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    let len = 0;
    for (let i = 1; i < present.length; i++) len += Math.hypot(px(present[i]) - px(present[i - 1]), py(present[i]) - py(present[i - 1]));
    path.setAttribute('stroke-dasharray', len.toFixed(1));
    path.setAttribute('stroke-dashoffset', len.toFixed(1));
    path.style.transition = 'stroke-dashoffset 0.8s ease';
    svg.appendChild(path);

    const dots = [];
    let selDot = null;
    present.forEach((p) => {
      const cx = px(p).toFixed(1), cy = py(p).toFixed(1);
      const c = svgEl('circle', { cx, cy, r: 3, fill: 'var(--gv-surface)', stroke: 'var(--gv-accent-line, var(--gv-lime))', 'stroke-width': 2 });
      c.style.opacity = '0';
      c.style.transition = 'opacity 0.3s ease';
      svg.appendChild(c);
      dots.push(c);
      const hit = svgEl('circle', { cx, cy, r: 10, fill: 'transparent', 'pointer-events': 'all' });
      hit.style.cursor = 'pointer';
      hit.onclick = (ev) => {
        if (ev) ev.stopPropagation();
        if (selDot) { selDot.setAttribute('r', 3); selDot.setAttribute('fill', 'var(--gv-surface)'); }
        selDot = c; c.setAttribute('r', 4.5); c.setAttribute('fill', 'var(--gv-accent-line, var(--gv-lime))');
        tip.show(hit, { title: `${pfx}-${String(p.day).padStart(2, '0')}`, label: curLabel, value: `${Math.round(p.value)}${unit ? ' ' + unit : ''}` });
      };
      svg.appendChild(hit);
    });

    canvas.appendChild(svg);
    raf(() => raf(() => {
      path.setAttribute('stroke-dashoffset', '0');
      dots.forEach((c, i) => { c.style.transitionDelay = (0.45 + i * 0.03) + 's'; c.style.opacity = '1'; });
    }));
  }

  prev.onclick = () => { if (offset < maxOffset) { offset++; render(); } };
  next.onclick = () => { if (offset > 0) { offset--; render(); } };
  render();
  return wrap;
}

module.exports = { monthGraph, buildDropdown };
