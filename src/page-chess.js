'use strict';
/* Chess — a dedicated activity page, fed by the LifeOS pipeline's
   chess-sessions.json (parsed from the chess.com PGNs in ~/chess-sync).

   Like Reading, this page only ARRANGES figures; it owns no data and writes
   nothing. data.js (loadChessSessions) hands it over as ctx.data.chess:
     { updated, totals:{games,wins,losses,draws},
       games:[{epoch,date,start,minutes,result,opponent,colour,my_elo,opp_elo,time_control,opening}],
       byDay }  — games newest-first; byDay maps YYYY-MM-DD -> games that day. */

const { el, ico, fmt, statTile, emptyLine } = require('./dom');
const { monthGraph } = require('./activity-graph');
const { activityHeatmap } = require('./activity-heatmap');
const { recentList } = require('./recent-list');
const { todayISO, fmtShort, startOfWeek, addDays } = require('./dates');

/* "300" -> "5 min", "180+2" -> "3+2", "1/259200" (daily) -> "daily". */
function fmtTC(tc) {
  if (!tc) return '';
  if (tc.indexOf('/') !== -1) return 'daily';
  if (tc.indexOf('+') !== -1) {
    const [base, inc] = tc.split('+');
    return `${Math.round(Number(base) / 60)}+${inc}`;
  }
  const n = Number(tc);
  return Number.isFinite(n) ? `${Math.round(n / 60)} min` : tc;
}

const RESULT_LETTER = { win: 'W', loss: 'L', draw: 'D' };

function render(ctx, root) {
  const { settings } = ctx;
  const chess = ctx.data && ctx.data.chess;
  const today = todayISO();

  root.append(el('div', { class: 'gv-toolbar' },
    el('h2', { class: 'gv-toolbar-title' }, 'Chess')));

  if (!chess || !Array.isArray(chess.games) || !chess.games.length) {
    root.append(emptyLine('No games yet — sync your chess.com games (chess-sync) and run the LifeOS pipeline.'));
    return;
  }

  const byDay = chess.byDay || {};
  const games = chess.games;                 // newest first
  const t = chess.totals || { games: games.length, wins: 0, losses: 0, draws: 0 };
  const winRate = t.games ? Math.round(100 * t.wins / t.games) : 0;

  /* ---- hero: lifetime record ---- */
  const todayGames = games.filter(g => g.date === today);
  const hero = el('div', { class: 'gv-hero' });
  hero.append(el('p', { class: 'gv-kicker' }, `${fmtShort(today)} · Chess`));
  hero.append(el('h2', { class: 'gv-display gv-hero-title' },
    el('span', { class: 'gv-mark' }, `${winRate}% win`)));
  hero.append(el('p', { class: 'gv-hero-sub' },
    `${t.wins}W · ${t.losses}L · ${t.draws}D over ${t.games} games` +
    (todayGames.length ? ` — ${todayGames.length} today` : '')));
  root.append(hero);

  /* ---- tiles: today / week / month / win rate ---- */
  const weekStart = startOfWeek(today, settings.weekStart);
  let weekN = 0;
  for (let i = 0; i < 7; i++) weekN += byDay[addDays(weekStart, i)] || 0;
  const ym = today.slice(0, 7);
  let monthN = 0;
  for (const d in byDay) if (d.slice(0, 7) === ym) monthN += byDay[d];
  root.append(el('div', { class: 'gv-tiles' },
    statTile(ico('crown'), fmt(byDay[today] || 0, ''), 'today'),
    statTile(ico('calendar-days'), fmt(weekN, ''), 'this week'),
    statTile(ico('calendar'), fmt(monthN, ''), 'this month'),
    statTile(ico('percent'), fmt(winRate, '%'), 'win rate')));

  /* ---- heatmap: full-width, tap a day for its game count ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('calendar-days'), el('span', {}, 'Activity')));
  activityHeatmap(root, byDay, {
    today, weekStart: settings.weekStart, unit: 'games', label: 'Chess',
    levels: v => v >= 5 ? 1 : v >= 3 ? 0.8 : v >= 2 ? 0.6 : 0.4,
    caption: 'Each square is a day — brighter is more games. Tap a day for detail.',
  });

  /* ---- graph: metric (Elo / win% / games) + filter by type/opening ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('trending-up'), el('span', {}, 'Graph')));
  const tcClass = tc => { if (!tc) return 'Other'; if (String(tc).indexOf('/') >= 0) return 'Daily'; const b = parseInt(tc, 10); return b < 180 ? 'Bullet' : b < 600 ? 'Blitz' : 'Rapid'; };
  const speeds = [...new Set(games.map(g => tcClass(g.time_control)))].sort();
  const openings = [...new Set(games.map(g => g.opening).filter(Boolean))].sort();
  monthGraph(root, null, {
    ariaName: 'Chess', label: 'Chess',
    metrics: [{ key: 'elo', label: 'Elo', unit: '' }, { key: 'winrate', label: 'Win %', unit: '%' }, { key: 'games', label: 'Games', unit: '' }],
    filters: [
      { key: 'speed', label: 'Type', options: [{ value: '', label: 'All types' }].concat(speeds.map(s => ({ value: s, label: s }))) },
      { key: 'opening', label: 'Opening', options: [{ value: '', label: 'All openings' }].concat(openings.map(o => ({ value: o, label: o }))) },
    ],
    compute: (metric, sel) => {
      const pass = g => (!sel.speed || tcClass(g.time_control) === sel.speed) && (!sel.opening || g.opening === sel.opening);
      const bd = {};
      if (metric === 'elo') {
        const last = {};
        for (const g of games) { if (!pass(g)) continue; const e = parseFloat(g.my_elo); if (!isFinite(e)) continue; const pr = last[g.date]; if (!pr || g.epoch > pr.t) last[g.date] = { t: g.epoch, v: e }; }
        for (const d in last) bd[d] = last[d].v;
        return bd;
      }
      const tally = {};
      for (const g of games) { if (!pass(g)) continue; const t = tally[g.date] || (tally[g.date] = { n: 0, w: 0 }); t.n++; if (g.result === 'win') t.w++; }
      for (const d in tally) bd[d] = metric === 'winrate' ? Math.round(100 * tally[d].w / tally[d].n) : tally[d].n;
      return bd;
    },
  });

  /* ---- recent games ---- */
  root.append(el('div', { class: 'gv-section-title' }, ico('history'), el('span', {}, 'Recent games')));
  const gameItem = g => {
    const letter = RESULT_LETTER[g.result] || '·';
    const bits = [g.colour, fmtTC(g.time_control), g.opening].filter(Boolean).join(' · ');
    return el('div', { class: `gv-card gv-runday gv-chess-${g.result || 'other'}` },
      el('div', { class: 'gv-runday-when' },
        el('div', { class: 'gv-runday-day' }, letter),
        el('div', { class: 'gv-runday-date' }, g.my_elo ? String(g.my_elo) : 'elo')),
      el('div', { class: 'gv-runday-main' },
        el('div', { class: 'gv-runday-name' }, g.opponent || 'Unknown'),
        el('div', { class: 'gv-runday-rx' }, `${fmtShort(g.date)}${bits ? ' · ' + bits : ''}`)));
  };
  recentList(root, {
    records: games,
    sorts: [
      { key: 'new', label: 'Newest', cmp: (a, b) => b.epoch - a.epoch },
      { key: 'old', label: 'Oldest', cmp: (a, b) => a.epoch - b.epoch },
      { key: 'elo', label: 'Highest Elo', cmp: (a, b) => (parseFloat(b.my_elo) || 0) - (parseFloat(a.my_elo) || 0) },
    ],
    filters: [
      { key: 'speed', label: 'Type', options: [{ value: '', label: 'All types' }].concat(speeds.map(s => ({ value: s, label: s }))) },
      { key: 'opening', label: 'Opening', options: [{ value: '', label: 'All openings' }].concat(openings.map(o => ({ value: o, label: o }))) },
    ],
    matchFilter: (g, k, v) => (k === 'speed' ? tcClass(g.time_control) === v : k === 'opening' ? g.opening === v : true),
    renderItem: gameItem,
  });

  if (chess.updated) {
    root.append(el('p', { class: 'gv-dim' }, `Synced from chess.com · ${chess.updated}`));
  }
}

module.exports = { render };
