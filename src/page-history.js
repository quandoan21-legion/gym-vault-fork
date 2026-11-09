'use strict';
/* History — activity heatmap plus every logged session, newest first. */

const { el, ico, fmtSeconds, clickableCard, emptyLine, statTile } = require('./dom');
const { todayISO, addDays, startOfWeek, fmtShort, monthLabel, weekdayKey } = require('./dates');
const { workoutDates, workoutDate, dayStreak, sessionCount, sessionVolume, sessionSets, countLabel, num } = require('./stats');
const { streakFlame } = require('./streak-flame');
const { ConfirmModal } = require('./modals');
const { monthGraph, buildDropdown } = require('./activity-graph');
const { activityHeatmap } = require('./activity-heatmap');

function render(ctx, root) {
  const { data, settings } = ctx;
  const today = todayISO();
  const dates = new Set(workoutDates(data.workouts));
  /* Every session on the list, including undated ones. This counted only
     DATED files while the list below rendered all of them, so the number and
     the cards under it could disagree — and Today counted unique dates on
     top of that, making three surfaces and three answers. stats.sessionCount
     is the one rule now. */
  const counted = sessionCount(data.workouts);

  root.append(el('div', { class: 'gv-toolbar' },
    el('h2', { class: 'gv-toolbar-title' }, 'Gym'),
    /* Records hang off here rather than taking its own nav tab — see
       page-records.js's header for the reasoning. */
    el('button', { class: 'gv-btn gv-btn-ghost gv-btn-small', type: 'button', onclick: () => ctx.nav('records') },
      ico('trophy'), el('span', {}, 'Records'))));

  /* ---- hero + tiles: the same shell Reading and Chess use, so the three
     activities read as one app. Figures reuse the existing rules
     (sessionVolume / workoutDate / dayStreak). ---- */
  const weekStart0 = startOfWeek(today, settings.weekStart);
  const weekISOs = new Set();
  for (let i = 0; i < 7; i++) weekISOs.add(addDays(weekStart0, i));
  const ym = today.slice(0, 7);
  const byDayVol = {};                 // date -> total volume that day (for graph + heatmap)
  let weekN = 0, monthN = 0, totalVol = 0, totalSets = 0;
  for (const w of data.workouts) {
    const d = workoutDate(w);
    const v = sessionVolume(w.rows);
    totalVol += v;
    totalSets += sessionSets(w.rows);
    if (d) byDayVol[d] = (byDayVol[d] || 0) + v;
    if (d && weekISOs.has(d)) weekN++;
    if (d && d.slice(0, 7) === ym) monthN++;
  }
  /* The VISIBLE streak honours "Reset streak" (Configure): when settings.streakStart
     is set, only training days on or after it count — the heatmap and the session
     cards still show the full history. */
  const streakDates = [...dates].filter(d => !settings.streakStart || d >= settings.streakStart);
  const streak = dayStreak(streakDates, settings.weekStart, today);

  const hero = el('div', { class: 'gv-hero' });
  hero.append(el('p', { class: 'gv-kicker' }, `${fmtShort(today)} · Gym`));
  hero.append(el('h2', { class: 'gv-display gv-hero-title' },
    el('span', { class: 'gv-mark' }, `${counted} session${counted === 1 ? '' : 's'}`)));
  hero.append(el('p', { class: 'gv-hero-sub' },
    `${weekN} this week · ${monthN} this month` + (streak ? ` · ${streak}-day streak` : '')));
  root.append(hero);

  root.append(el('div', { class: 'gv-tiles' },
    statTile(ico('dumbbell'), String(weekN), 'this week'),
    statTile(ico('layers'), String(totalSets), 'total sets'),
    statTile(ico('calendar'), String(monthN), 'this month'),
    statTile(ico('trending-up'), totalVol ? `${totalVol}kg` : '0kg', 'all-time vol')));

  /* ---- heatmap: full-width, tap a day for its volume ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('calendar-days'), el('span', {}, 'Activity')));
  activityHeatmap(root, byDayVol, {
    today, weekStart: settings.weekStart, unit: 'kg', label: 'Gym',
    levels: v => v >= 4000 ? 1 : v >= 2500 ? 0.8 : v >= 1000 ? 0.6 : 0.4,
    caption: 'Each square is a day — brighter is more volume. Tap a day for detail.',
  });

  /* ---- graph: metric (volume / max kg / reps) + filter by exercise/muscle ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('trending-up'), el('span', {}, 'Graph')));
  const parseMuscles = v => (Array.isArray(v) ? v : v ? [v] : []).flatMap(s => String(s).split(',').map(x => x.trim()).filter(Boolean));
  const muscleOf = {};
  for (const ex of (data.exercises || [])) muscleOf[(ex.name || '').trim().toLowerCase()] = parseMuscles(ex.fm && ex.fm.muscles);
  const gymSets = [];
  for (const w of data.workouts) {
    const dd = workoutDate(w); if (!dd) continue;
    for (const r of w.rows) {
      if (!r.exercise) continue;
      gymSets.push({ date: dd, exercise: r.exercise, weight: num(r.weight_kg) || 0, reps: num(r.reps) || 0, muscles: muscleOf[r.exercise.trim().toLowerCase()] || [] });
    }
  }
  const exNames = [...new Set(gymSets.map(s => s.exercise))].sort();
  const muscleNames = [...new Set(gymSets.flatMap(s => s.muscles))].sort();
  monthGraph(root, null, {
    ariaName: 'Gym', label: 'Gym',
    metrics: [{ key: 'volume', label: 'Volume', unit: 'kg' }, { key: 'maxweight', label: 'Max kg', unit: 'kg' }, { key: 'reps', label: 'Reps', unit: '' }],
    filters: [
      { key: 'exercise', label: 'Exercise', options: [{ value: '', label: 'All exercises' }].concat(exNames.map(e => ({ value: e, label: e }))) },
      { key: 'muscle', label: 'Muscle', options: [{ value: '', label: 'All muscles' }].concat(muscleNames.map(m => ({ value: m, label: m }))) },
    ],
    compute: (metric, sel) => {
      const bd = {};
      for (const s of gymSets) {
        if (sel.exercise && s.exercise !== sel.exercise) continue;
        if (sel.muscle && !s.muscles.includes(sel.muscle)) continue;
        if (metric === 'maxweight') bd[s.date] = Math.max(bd[s.date] || 0, s.weight);
        else if (metric === 'reps') bd[s.date] = (bd[s.date] || 0) + s.reps;
        else bd[s.date] = (bd[s.date] || 0) + s.weight * s.reps;
      }
      return bd;
    },
  });

  /* The same flame the dashboard shows, from the same dayStreak call (and the
     same reset-aware dates) — one figure, one component, so the two pages cannot
     disagree about how long the streak is or how hot it should look. */
  root.append(streakFlame(dayStreak(streakDates, settings.weekStart, today)));

  if (!data.workouts.length) {
    root.append(emptyLine('Nothing logged yet — your first session will land here.'));
    return;
  }

  /* ---- sessions: sort + filter (by exercise / muscle), grouped by month ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('history'), el('span', {}, 'Sessions')));
  let sortKey = 'new';
  const fsel = {};
  const scontrols = el('div', { style: 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:8px;' });
  scontrols.append(buildDropdown([{ value: 'new', label: 'Newest' }, { value: 'old', label: 'Oldest' }], 'new', v => { sortKey = v; renderSessions(); }));
  scontrols.append(buildDropdown([{ value: '', label: 'All exercises' }].concat(exNames.map(e => ({ value: e, label: e }))), '', v => { fsel.exercise = v; renderSessions(); }));
  scontrols.append(buildDropdown([{ value: '', label: 'All muscles' }].concat(muscleNames.map(m => ({ value: m, label: m }))), '', v => { fsel.muscle = v; renderSessions(); }));
  root.append(scontrols);
  const listHost = el('div', {});
  root.append(listHost);

  const matchW = w => {
    if (fsel.exercise && !w.rows.some(r => r.exercise === fsel.exercise)) return false;
    if (fsel.muscle && !w.rows.some(r => (muscleOf[(r.exercise || '').trim().toLowerCase()] || []).includes(fsel.muscle))) return false;
    return true;
  };
  const openName = ctx.state.params && ctx.state.params.session;
  function renderSessions() {
    while (listHost.firstChild) listHost.removeChild(listHost.firstChild);
    let ws = data.workouts.filter(matchW).slice();
    ws.sort((a, b) => { const da = workoutDate(a) || '', db = workoutDate(b) || ''; return sortKey === 'old' ? (da < db ? -1 : da > db ? 1 : 0) : (da > db ? -1 : da < db ? 1 : 0); });
    if (!ws.length) { listHost.append(emptyLine('No matching sessions.')); return; }
    let lastMonth = '';
    for (const w of ws) {
      const m = monthLabel(workoutDate(w) || '');
      if (m && m !== lastMonth) { listHost.append(el('div', { class: 'gv-section-title' }, ico('calendar-days'), el('span', {}, m))); lastMonth = m; }
      listHost.append(sessionCard(ctx, w, w.name === openName));
    }
  }
  renderSessions();
}

function sessionCard(ctx, w, open) {
  const vol = sessionVolume(w.rows);
  const meta = [
    countLabel(sessionSets(w.rows), 'set'),
    vol ? `${vol}kg volume` : null,
    w.fm.duration_min ? `${w.fm.duration_min} min` : null,
  ].filter(Boolean).join(' · ');

  const card = el('div', { class: `gv-card gv-session-card${open ? ' open' : ''}` });
  /* An unreadable date falls back to the file name rather than printing a
     date nothing else in the app agrees with. */
  const d = workoutDate(w);
  const whenLabel = d ? fmtShort(d) : w.name;
  const head = clickableCard(
    { class: 'gv-session-head', 'aria-expanded': open ? 'true' : 'false', 'aria-label': `${whenLabel} session, ${open ? 'expanded' : 'collapsed'}` },
    () => ctx.nav('history', { session: open ? undefined : w.name }),
    el('div', { class: 'gv-session-when' },
      el('div', { class: 'gv-session-date' }, whenLabel),
      el('div', { class: 'gv-session-day' }, [w.fm.day, w.fm.plan].filter(Boolean).join(' · ') || 'Freestyle')),
    el('div', { class: 'gv-session-meta' }, meta),
    el('div', { class: 'gv-card-actions' },
      iconBtn('trash-2', 'Delete session', () => new ConfirmModal(ctx.app, {
        title: 'Delete session?',
        message: `${w.name} will be deleted, following your Obsidian "Deleted files" setting.`,
        onConfirm: async () => { await ctx.io.trash(w.file); ctx.reload(); },
      }).open()),
      ico(open ? 'chevron-left' : 'chevron-right', 'gv-dim')));
  card.append(head);

  if (open) {
    const table = el('div', { class: 'gv-set-table' });
    /* Group ALL rows of an exercise together (not just consecutive runs), keyed
       by a folded name, keeping first-seen order and display name. A plan that
       prescribes an exercise over several lines (a pyramid) used to split into
       repeated headers with set numbers restarting at 1; one group per exercise
       fixes both. */
    const groups = new Map();
    for (const r of w.rows) {
      const key = (r.exercise || '').trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { exercise: r.exercise, rows: [] });
      groups.get(key).rows.push(r);
    }

    /* One performed set -> a compact token (reps×weight, or a cardio/hold form). */
    const setToken = r => {
      if (r.weight_kg) return `${r.reps || '?'}×${r.weight_kg}`;
      if (r.distance_km) return `${r.distance_km}km${r.seconds ? ' ' + fmtSeconds(r.seconds) : ''}`;
      if (r.seconds) return fmtSeconds(r.seconds);
      return `${r.reps || '?'}`;
    };

    for (const g of groups.values()) {
      /* Per-exercise summary: set count · heaviest set · total volume. */
      const gVol = sessionVolume(g.rows);
      const topW = g.rows.reduce((m, r) => Math.max(m, num(r.weight_kg) || 0), 0);
      const summary = [countLabel(sessionSets(g.rows), 'set')];
      if (topW) summary.push(`top ${topW}kg`);
      if (gVol) summary.push(`${gVol}kg`);

      table.append(el('div', { style: 'display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin:10px 0 4px;' },
        el('span', { class: 'gv-set-ex', style: 'margin:0;' }, g.exercise),
        el('span', { class: 'gv-dim', style: 'font-size:11px; white-space:nowrap;' }, summary.join(' · '))));

      /* Collapse consecutive identical sets: 10×17.5, 10×17.5 -> "2× 10×17.5". */
      const toks = [];
      for (const r of g.rows) {
        const t = setToken(r);
        const last = toks[toks.length - 1];
        if (last && last.t === t) last.n++;
        else toks.push({ t, n: 1 });
      }
      const line = toks.map(x => (x.n > 1 ? `${x.n}× ${x.t}` : x.t)).join('   ');
      table.append(el('div', { class: 'gv-set-row' }, el('span', {}, line || '—')));

      const notes = g.rows.map(r => r.note).filter(Boolean);
      if (notes.length) table.append(el('div', { class: 'gv-dim', style: 'font-size:12px; padding:2px 0 0;' }, notes.join(' · ')));
    }
    const openNote = el('button', { class: 'gv-btn gv-btn-ghost gv-btn-small', type: 'button' },
      ico('pencil'), el('span', {}, 'Open note'));
    openNote.addEventListener('click', () => ctx.openFile(w.file));
    table.append(el('div', { class: 'gv-session-foot' }, openNote));
    card.append(table);
  }
  return card;
}

function iconBtn(name, label, onClick) {
  const b = el('button', { class: 'gv-icon-btn', type: 'button', 'aria-label': label }, ico(name));
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

module.exports = { render };
