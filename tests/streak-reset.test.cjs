'use strict';
/* RESET STREAK FROM TODAY.

   "Reset streak" (Configure) sets settings.streakStart to a day without deleting any
   workout note. The DISPLAYED day-streak (dashboard + History) then counts only
   training days on or after it; XP, the best-streak medal and the workout history are
   untouched. This pins:
     1. the dashboard flame honours settings.streakStart (rendering the real page);
     2. both page-dashboard AND page-history filter their dates by it before dayStreak;
     3. streakStart has a sane default ('' = all history). */
const assert = require('node:assert');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

/* Minimal DOM stub + obsidian stub, the same shape the other dashboard-render tests use. */
const mkNode = tag => ({
  nodeType: 1, tag, className: '', style: {}, children: [], attrs: {}, listeners: {}, parent: null,
  classList: {
    add(c) { const s = new Set(String(this.owner.className).split(/\s+/).filter(Boolean)); s.add(c); this.owner.className = [...s].join(' '); },
    remove(c) { const s = new Set(String(this.owner.className).split(/\s+/).filter(Boolean)); s.delete(c); this.owner.className = [...s].join(' '); },
    contains(c) { return String(this.owner.className).split(/\s+/).includes(c); },
    toggle(c, on) { const want = on === undefined ? !this.contains(c) : !!on; return want ? this.add(c) : this.remove(c); },
  },
  setAttribute(k, v) { this.attrs[k] = String(v); },
  getAttribute(k) { return this.attrs[k]; },
  addEventListener(ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); },
  append(...kids) { for (const k of kids) { if (k && k.nodeType === 1) k.parent = this; this.children.push(k); } },
  appendChild(k) { this.append(k); return k; },
  get textContent() { return this.children.map(c => (c.nodeType === 3 ? c.text : c.textContent || '')).join(''); },
  querySelector(sel) {
    const want = sel.replace(/^\./, '');
    const walk = node => { for (const c of node.children || []) { if (c.nodeType !== 1) continue; if (c.tag === want || clsOf(c).includes(want)) return c; const h = walk(c); if (h) return h; } return null; };
    return walk(this);
  },
});
global.document = {
  createElement(tag) { const n = mkNode(tag); n.classList.owner = n; return n; },
  createElementNS(_ns, tag) { const n = mkNode(tag); n.classList.owner = n; return n; },
  createTextNode(t) { return { nodeType: 3, tag: '#text', text: String(t) }; },
};
global.window = global.window || {};

const origLoad = Module._load;
Module._load = (req, ...rest) => (req === 'obsidian' ? {
  setIcon: () => {}, Notice: class {}, Modal: class {}, Setting: class {}, ItemView: class {}, Plugin: class {},
  PluginSettingTab: class {}, TFile: class {}, normalizePath: p => p, requestUrl: async () => ({}), Platform: { isMobile: false },
} : origLoad(req, ...rest));
const dashboard = require('../src/page-dashboard');
const { DEFAULT_SETTINGS } = require('../src/constants');
const { dayStreak } = require('../src/stats');
const { todayISO, addDays } = require('../src/dates');
Module._load = origLoad;

const clsOf = n => `${n.className} ${n.attrs.class || ''}`.split(/\s+/).filter(Boolean);
const findAll = (node, cls, out) => {
  out = out || [];
  for (const c of node.children || []) { if (c.nodeType !== 1) continue; if (clsOf(c).includes(cls)) out.push(c); findAll(c, cls, out); }
  return out;
};
const first = (node, cls) => findAll(node, cls)[0] || null;
const textOf = node => (node ? node.textContent : null);

const TODAY = todayISO();
const day = { name: 'Push', weekday: 'mon', items: [{ exercise: 'Dips', sets: 3, target: 'AMRAP' }], notes: [] };
const planOf = d => ({ name: 'P', fm: { active: 'true' }, model: { days: [d], intro: [] } });
const w = date => ({ name: date, fm: { date }, rows: [{ exercise: 'Dips', reps: '9' }] });
/* `len` consecutive training days ending today -> a day-streak of `len`. */
const run = len => Array.from({ length: len }, (_, i) => w(addDays(TODAY, -i)));

function render(settings) {
  const pl = planOf(day);
  const ctx = {
    app: {}, data: { workouts: run(6), exercises: [{ name: 'Dips', fm: { unit: 'reps' } }], goals: [], body: [] },
    settings: Object.assign({ weekStart: 'mon', streakStart: '' }, settings || {}), state: { logDraft: null },
    io: {}, nav() {}, notice() {}, reload() {}, rerender() {}, startGuided() {}, startLog() {},
    activePlan: () => pl, activePlanIsImplicit: () => false, mainPlans: () => [pl],
    parallelPlans: () => [], fallbackPlans: () => [], daysOn: () => [{ plan: pl, day }],
  };
  const root = mkNode('div'); root.classList.owner = root;
  dashboard.render(ctx, root);
  return root;
}
const flameNum = root => textOf(first(first(root, 'gv-streak'), 'gv-streak-num'));

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.strictEqual(a, b, m); n++; };

/* 0. the setting exists with a count-all-history default */
eq(DEFAULT_SETTINGS.streakStart, '', "streakStart defaults to '' (count all history)");

/* 1. six consecutive days ending today: no reset -> the flame shows all six */
eq(flameNum(render({})), '6', 'no streakStart: the streak counts the whole run');

/* 2. a reset two days ago: training days before it are ignored -> only the last three */
eq(flameNum(render({ streakStart: addDays(TODAY, -2) })), '3', 'streakStart ignores older training days');

/* 3. a reset today over a history full of older dates == just today's run (one day) */
eq(flameNum(render({ streakStart: TODAY })), '1', 'streakStart=today over an older history equals today alone');

/* 4. the semantics match stats.dayStreak over the filtered dates (one rule, both ways) */
const dates = run(6).map(x => x.fm.date).sort();
const start = addDays(TODAY, -2);
eq(dayStreak(dates.filter(d => d >= start), 'mon', TODAY), 3, 'filter-then-dayStreak is what the pages do');
eq(dayStreak(dates, 'mon', TODAY), 6, 'and unfiltered it is the full run');

/* 5. page-history filters its dates by streakStart before dayStreak too (same one-liner) */
const histSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-history.js'), 'utf8');
ok(/settings\.streakStart/.test(histSrc) && /dayStreak\(streakDates/.test(histSrc),
  'History builds the streak from dates filtered by settings.streakStart');
const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-dashboard.js'), 'utf8');
ok(/settings\.streakStart/.test(dashSrc) && /dayStreak\(streakDates/.test(dashSrc),
  'the dashboard does the same');

console.log(`streak-reset OK (${n} checks)`);
