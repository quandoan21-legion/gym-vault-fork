'use strict';
/* Focus (Pomodoro) — a dedicated activity page, fed by the LifeOS pipeline's
   pomodoro-sessions.json (from the Pomodoro Timer plugin's daily-note logs).

   Like Reading/Chess, this page only ARRANGES figures; it owns no data and
   writes nothing. data.js (loadPomodoroSessions) hands it over as
   ctx.data.pomodoro:
     { updated, totals:{sessions,minutes},
       sessions:[{epoch,date,start,minutes}], byDay }  — sessions newest-first;
   byDay maps YYYY-MM-DD -> minutes focused. */

const { el, ico, fmt, statTile, emptyLine } = require('./dom');
const { monthGraph } = require('./activity-graph');
const { activityHeatmap } = require('./activity-heatmap');
const { recentList } = require('./recent-list');
const { todayISO, fmtShort, startOfWeek, addDays } = require('./dates');

function render(ctx, root) {
  const { settings } = ctx;
  const pomo = ctx.data && ctx.data.pomodoro;
  const today = todayISO();

  root.append(el('div', { class: 'gv-toolbar' },
    el('h2', { class: 'gv-toolbar-title' }, 'Focus')));

  /* One-tap start of the iOS Pomodoro cycle: runs the "Pomodoro Start"
     Shortcut via the shortcuts:// scheme (iOS only; on desktop the scheme
     does nothing). Shown even before any session exists so day 1 can begin.
     window.open first (music-link.js's rule: a new app/tab, never navigate the
     view away); an anchor-click fallback for webviews that ignore window.open. */
  const startBtn = el('button', { class: 'gv-btn-go', type: 'button' },
    ico('timer'), el('span', {}, 'Bắt đầu Pomodoro'));
  startBtn.addEventListener('click', () => {
    const url = 'shortcuts://run-shortcut?name=Pomodoro%20Start';
    const w = window.open(url, '_blank');
    if (!w) { const a = el('a', { href: url }); document.body.appendChild(a); a.click(); a.remove(); }
  });
  root.append(startBtn);

  if (!pomo || !Array.isArray(pomo.sessions) || !pomo.sessions.length) {
    root.append(emptyLine('No focus sessions yet — run the Pomodoro Timer (it logs to your daily note), then the LifeOS pipeline, and they land here.'));
    return;
  }

  const byDay = pomo.byDay || {};
  const sessions = pomo.sessions;            // newest first

  /* ---- hero: today ---- */
  const todayMin = Math.round(byDay[today] || 0);
  const todayN = sessions.filter(s => s.date === today).length;
  const hero = el('div', { class: 'gv-hero' });
  hero.append(el('p', { class: 'gv-kicker' }, `${fmtShort(today)} · Focus`));
  hero.append(el('h2', { class: 'gv-display gv-hero-title' },
    el('span', { class: 'gv-mark' }, todayMin ? `${todayMin} min` : 'Focus')));
  hero.append(el('p', { class: 'gv-hero-sub' },
    todayMin ? `${todayN} session${todayN === 1 ? '' : 's'} today` : 'No focus logged today yet.'));
  root.append(hero);

  /* ---- tiles: today / week / month / all time (minutes) ---- */
  const weekStart = startOfWeek(today, settings.weekStart);
  let weekMin = 0;
  for (let i = 0; i < 7; i++) weekMin += byDay[addDays(weekStart, i)] || 0;
  const ym = today.slice(0, 7);
  let monthMin = 0, totalMin = 0;
  for (const d in byDay) { totalMin += byDay[d]; if (d.slice(0, 7) === ym) monthMin += byDay[d]; }
  root.append(el('div', { class: 'gv-tiles' },
    statTile(ico('timer'), fmt(todayMin, ' min'), 'today'),
    statTile(ico('calendar-days'), fmt(Math.round(weekMin), ' min'), 'this week'),
    statTile(ico('calendar'), fmt(Math.round(monthMin), ' min'), 'this month'),
    statTile(ico('history'), fmt(Math.round(totalMin), ' min'), 'all time')));

  /* ---- heatmap: full-width, tap a day for its focus minutes ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('calendar-days'), el('span', {}, 'Activity')));
  activityHeatmap(root, byDay, {
    today, weekStart: settings.weekStart, unit: 'min', label: 'Focus',
    levels: v => v >= 100 ? 1 : v >= 50 ? 0.8 : v >= 25 ? 0.6 : 0.4,
    caption: 'Each square is a day — brighter is more minutes focused. Tap a day for detail.',
  });

  /* ---- graph: per-month daily minutes, with month nav + draw animation ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('trending-up'), el('span', {}, 'Graph')));
  monthGraph(root, byDay, { unit: 'min', ariaName: 'Focus minutes', label: 'Focus' });

  /* ---- recent sessions ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('history'), el('span', {}, 'Recent sessions')));
  const focusItem = s => el('div', { class: 'gv-card gv-runday' },
    el('div', { class: 'gv-runday-when' },
      el('div', { class: 'gv-runday-day' }, String(Math.round(s.minutes))),
      el('div', { class: 'gv-runday-date' }, 'min')),
    el('div', { class: 'gv-runday-main' },
      el('div', { class: 'gv-runday-name' }, 'Focus session'),
      el('div', { class: 'gv-runday-rx' }, `${fmtShort(s.date)} · ${s.start}`)));
  recentList(root, {
    records: sessions,
    sorts: [
      { key: 'new', label: 'Newest', cmp: (a, b) => b.epoch - a.epoch },
      { key: 'old', label: 'Oldest', cmp: (a, b) => a.epoch - b.epoch },
      { key: 'long', label: 'Longest', cmp: (a, b) => b.minutes - a.minutes },
    ],
    renderItem: focusItem,
  });

  if (pomo.updated) {
    root.append(el('p', { class: 'gv-dim' }, `Synced · ${pomo.updated}`));
  }
}

module.exports = { render };
