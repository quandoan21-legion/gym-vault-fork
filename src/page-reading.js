'use strict';
/* Reading — a dedicated activity page, fed by the LifeOS pipeline's
   reading-sessions.json (KOReader stats pulled off the Kindle over Tailscale).

   Like Running, this page only ARRANGES figures; it owns no data of its own
   and writes nothing. The JSON is read by data.js (loadReadingSessions) through
   the vault adapter and handed over as ctx.data.reading:
     { updated, source, sessions:[{epoch,date,start,minutes,pages,book}], byDay }
   sessions are newest-first; byDay maps YYYY-MM-DD -> minutes. */

const { el, ico, fmt, statTile, emptyLine } = require('./dom');
const { monthGraph } = require('./activity-graph');
const { activityHeatmap } = require('./activity-heatmap');
const { recentList } = require('./recent-list');
const { todayISO, fmtShort, startOfWeek, addDays } = require('./dates');

function render(ctx, root) {
  const { settings } = ctx;
  const reading = ctx.data && ctx.data.reading;
  const today = todayISO();

  root.append(el('div', { class: 'gv-toolbar' },
    el('h2', { class: 'gv-toolbar-title' }, 'Reading')));

  if (!reading || !Array.isArray(reading.sessions) || !reading.sessions.length) {
    root.append(emptyLine('No reading yet — pull your Kindle stats with the LifeOS pipeline (run.sh) and they land here.'));
    return;
  }

  const byDay = reading.byDay || {};
  const sessions = reading.sessions;          // newest first

  /* ---- hero: today ---- */
  const todayMin = Math.round(byDay[today] || 0);
  const todayBooks = [...new Set(sessions.filter(s => s.date === today).map(s => s.book).filter(Boolean))];
  const hero = el('div', { class: 'gv-hero' });
  hero.append(el('p', { class: 'gv-kicker' }, `${fmtShort(today)} · Reading`));
  hero.append(el('h2', { class: 'gv-display gv-hero-title' },
    el('span', { class: 'gv-mark' }, todayMin ? `${todayMin} min` : 'Reading')));
  hero.append(el('p', { class: 'gv-hero-sub' },
    todayMin
      ? (todayBooks.length ? `Today: ${todayBooks.join(', ')}` : 'Read today — nice.')
      : 'No reading logged today yet.'));
  root.append(hero);

  /* ---- tiles: today / week / month / all time (minutes) ---- */
  const weekStart = startOfWeek(today, settings.weekStart);
  let weekMin = 0;
  for (let i = 0; i < 7; i++) weekMin += byDay[addDays(weekStart, i)] || 0;
  const ym = today.slice(0, 7);
  let monthMin = 0, totalMin = 0;
  for (const d in byDay) { totalMin += byDay[d]; if (d.slice(0, 7) === ym) monthMin += byDay[d]; }
  root.append(el('div', { class: 'gv-tiles' },
    statTile(ico('book-open'), fmt(todayMin, ' min'), 'today'),
    statTile(ico('calendar-days'), fmt(Math.round(weekMin), ' min'), 'this week'),
    statTile(ico('calendar'), fmt(Math.round(monthMin), ' min'), 'this month'),
    statTile(ico('history'), fmt(Math.round(totalMin), ' min'), 'all time')));

  /* ---- heatmap: full-width, tap a day for its minutes ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('calendar-days'), el('span', {}, 'Activity')));
  activityHeatmap(root, byDay, {
    today, weekStart: settings.weekStart, unit: 'min', label: 'Reading',
    levels: v => v >= 45 ? 1 : v >= 30 ? 0.8 : v >= 15 ? 0.6 : 0.4,
    caption: 'Each square is a day — brighter is more minutes read. Tap a day for detail.',
  });

  /* ---- graph: metric (minutes/pages) + filter by book, per-month ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('trending-up'), el('span', {}, 'Graph')));
  const books = [...new Set(sessions.map(s => s.book).filter(Boolean))].sort();
  monthGraph(root, null, {
    ariaName: 'Reading', label: 'Reading',
    metrics: [{ key: 'minutes', label: 'Minutes', unit: 'min' }, { key: 'pages', label: 'Pages', unit: 'p' }],
    filters: [{ key: 'book', label: 'Book', options: [{ value: '', label: 'All books' }].concat(books.map(b => ({ value: b, label: b }))) }],
    compute: (metric, sel) => {
      const bd = {};
      for (const s of sessions) {
        if (sel.book && s.book !== sel.book) continue;
        const v = metric === 'pages' ? (s.pages || 0) : (s.minutes || 0);
        bd[s.date] = (bd[s.date] || 0) + v;
      }
      return bd;
    },
  });

  /* ---- recent sessions ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('history'), el('span', {}, 'Recent sessions')));
  const readItem = s => el('div', { class: 'gv-card gv-runday' },
    el('div', { class: 'gv-runday-when' },
      el('div', { class: 'gv-runday-day' }, String(Math.round(s.minutes))),
      el('div', { class: 'gv-runday-date' }, 'min')),
    el('div', { class: 'gv-runday-main' },
      el('div', { class: 'gv-runday-name' }, s.book || 'Unknown'),
      el('div', { class: 'gv-runday-rx' },
        `${fmtShort(s.date)} · ${s.start}${s.pages ? ' · ' + s.pages + 'p' : ''}`)));
  recentList(root, {
    records: sessions,
    sorts: [
      { key: 'new', label: 'Newest', cmp: (a, b) => b.epoch - a.epoch },
      { key: 'old', label: 'Oldest', cmp: (a, b) => a.epoch - b.epoch },
      { key: 'long', label: 'Longest', cmp: (a, b) => b.minutes - a.minutes },
      { key: 'pages', label: 'Most pages', cmp: (a, b) => (b.pages || 0) - (a.pages || 0) },
    ],
    filters: [{ key: 'book', label: 'Book', options: [{ value: '', label: 'All books' }].concat(books.map(b => ({ value: b, label: b }))) }],
    matchFilter: (s, k, v) => (k === 'book' ? s.book === v : true),
    renderItem: readItem,
  });

  if (reading.updated) {
    root.append(el('p', { class: 'gv-dim' }, `Synced from Kindle · ${reading.updated}`));
  }
}

module.exports = { render };
