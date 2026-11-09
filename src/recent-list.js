'use strict';
/* A recent-items list with the same control vocabulary as the graph: a Sort
   dropdown + filter dropdowns (all the themed gv-chip dropdown), above a
   gv-card-list that re-filters/sorts live. Shared by Reading / Chess / Focus.

   cfg = {
     records,                       // array
     sorts: [{key,label,cmp(a,b)}], // first is default
     filters: [{key,label,options:[{value,label}]}],   // optional
     matchFilter: (r, key, value) => bool,              // required if filters
     renderItem: (r) => Element,
     limit,                         // default 15
   } */

const { el, emptyLine } = require('./dom');
const { buildDropdown } = require('./activity-graph');

function recentList(host, cfg) {
  const sorts = cfg.sorts && cfg.sorts.length ? cfg.sorts : [{ key: 'new', label: 'Newest', cmp: (a, b) => (b.epoch || 0) - (a.epoch || 0) }];
  const filters = cfg.filters || [];
  const limit = cfg.limit || 15;
  const sortMap = {};
  sorts.forEach(s => { sortMap[s.key] = s; });
  let sortKey = sorts[0].key;
  const sel = {};

  const wrap = el('div', {});
  if (sorts.length > 1 || filters.length) {
    const controls = el('div', { style: 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:8px;' });
    if (sorts.length > 1) controls.append(buildDropdown(sorts.map(s => ({ value: s.key, label: s.label })), sortKey, v => { sortKey = v; render(); }));
    for (const f of filters) controls.append(buildDropdown(f.options, '', v => { sel[f.key] = v; render(); }));
    wrap.append(controls);
  }
  const listEl = el('div', { class: 'gv-card-list' });
  wrap.append(listEl);
  host.append(wrap);

  function render() {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    let rows = cfg.records.filter(r => filters.every(f => !sel[f.key] || cfg.matchFilter(r, f.key, sel[f.key])));
    rows = rows.slice().sort(sortMap[sortKey].cmp).slice(0, limit);
    if (!rows.length) { listEl.append(emptyLine('No matches.')); return; }
    for (const r of rows) listEl.append(cfg.renderItem(r));
  }
  render();
  return wrap;
}

module.exports = { recentList };
