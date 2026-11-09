'use strict';
/* Configure — a hub for the gym setup pages that no longer each own a nav tab.
   Plans, Exercises and Goals (plus Records and Profile) are reached from here.
   Each card just navigates to the existing page module; nothing new is stored. */

const { el, ico, clickableCard } = require('./dom');
const { ConfirmModal } = require('./modals');
const { todayISO } = require('./dates');
const { openAddDayPicker } = require('./page-plans');

const ITEMS = [
  { id: 'plans',     icon: 'clipboard-list', name: 'Plans',     desc: 'Training programmes & weekly schedule' },
  { id: 'exercises', icon: 'dumbbell',       name: 'Exercises', desc: 'Your movement library' },
  { id: 'goals',     icon: 'target',         name: 'Goals',     desc: 'Targets to chase' },
  { id: 'records',   icon: 'trophy',         name: 'Records',   desc: 'Personal bests' },
  { id: 'profile',   icon: 'user',           name: 'Profile',   desc: 'Body stats & preferences' },
];

function render(ctx, root) {
  root.append(el('div', { class: 'gv-toolbar' },
    el('h2', { class: 'gv-toolbar-title' }, 'Configure')));

  root.append(el('div', { class: 'gv-section-title' }, ico('sliders-horizontal'), el('span', {}, 'Gym setup')));

  const list = el('div', { class: 'gv-card-list' });
  for (const it of ITEMS) {
    list.append(clickableCard(
      { class: 'gv-card', style: 'display:flex; align-items:center; gap:12px; cursor:pointer;' },
      () => ctx.nav(it.id),
      ico(it.icon),
      el('div', { style: 'flex:1 1 auto; min-width:0;' },
        el('div', { class: 'gv-set-ex', style: 'margin:0;' }, it.name),
        el('div', { class: 'gv-dim', style: 'font-size:12px;' }, it.desc)),
      ico('chevron-right', 'gv-dim')));
  }
  root.append(list);

  /* Quick action: add a training day to any plan without first opening that
     plan's detail page. The plan detail already has "Add day"; this is the
     same thing reachable from the hub, led by a plan picker. */
  const actions = el('div', { class: 'gv-card-list' });
  actions.append(clickableCard(
    { class: 'gv-card', style: 'display:flex; align-items:center; gap:12px; cursor:pointer;' },
    () => openAddDayPicker(ctx),
    ico('calendar-days'),
    el('div', { style: 'flex:1 1 auto; min-width:0;' },
      el('div', { class: 'gv-set-ex', style: 'margin:0;' }, 'Add workout day'),
      el('div', { class: 'gv-dim', style: 'font-size:12px;' }, 'Add a training day to one of your plans')),
    ico('chevron-right', 'gv-dim')));
  root.append(actions);

  /* Streak — the one control here that STORES something. "Reset streak" starts the
     day-streak counting from today without touching any workout note (it sets
     settings.streakStart; the dashboard and History filter their dates by it). */
  root.append(el('div', { class: 'gv-section-title' }, ico('flame'), el('span', {}, 'Streak')));
  const streakList = el('div', { class: 'gv-card-list' });
  streakList.append(clickableCard(
    { class: 'gv-card', style: 'display:flex; align-items:center; gap:12px; cursor:pointer;' },
    () => new ConfirmModal(ctx.app, {
      title: 'Reset streak?',
      message: 'It will start counting from today. Your workout history is kept.',
      confirmLabel: 'Reset streak',
      onConfirm: async () => {
        ctx.plugin.settings.streakStart = todayISO();
        ctx.settings = ctx.plugin.settings;
        await ctx.plugin.saveSettings();
        ctx.rerender();
      },
    }).open(),
    ico('rotate-ccw'),
    el('div', { style: 'flex:1 1 auto; min-width:0;' },
      el('div', { class: 'gv-set-ex', style: 'margin:0;' }, 'Reset streak'),
      el('div', { class: 'gv-dim', style: 'font-size:12px;' }, 'Start the streak from today (history kept)')),
    ico('chevron-right', 'gv-dim')));
  root.append(streakList);
}

module.exports = { render };
