'use strict';
/* Small form modals, built on Obsidian's Modal + Setting so they match the
   host UI and stay iOS-safe (no window.prompt/confirm/alert — those don't
   exist in Electron). One generic FormModal covers every add/edit form. */

const { Modal, Setting, Notice } = require('obsidian');
const { el, clickableCard } = require('./dom');
const { DEFAULT_SETTINGS, skinClasses } = require('./constants');
const { bodyMap, SLUG_TO_APP } = require('./body-map');

/* A modal action that fails must SAY so. These all used to land in
   console.error alone, which on a phone is invisible — a delete that threw
   looked exactly like a delete that did nothing, and cost a debugging round
   to tell apart. */
const failed = (what, e) => {
  console.error(`gym-vault ${what}`, e);
  new Notice(`Gym: ${what} failed — ${(e && e.message) || e}`, 8000);
};

/* Dress a dialog as the app, for the one modal whose content is the app's own cards.
   Obsidian appends a modal to <body>, outside the view, so none of the --gv-* tokens reach
   it. The rep counter and media viewer are handed the skin and accent by their caller; the
   picker is only ever opened FROM the view, so it copies the live root's own skin and accent
   classes instead (one source, nothing to keep in step), falling back to the defaults when
   there is no view to read. Never read the settings from the plugin object: that is not API. */
function wearApp(modalEl) {
  modalEl.addClass('gv-app');
  const root = document.querySelector('.view-content.gv-app');
  const own = root ? String(root.className).split(/\s+/).filter(c => c.indexOf('gv-skin-') === 0 || c.indexOf('gv-accent-') === 0) : [];
  const cls = own.length ? own : skinClasses(DEFAULT_SETTINGS.skin).concat(`gv-accent-${DEFAULT_SETTINGS.accent}`);
  for (const c of cls) modalEl.addClass(c);
}

/* fields: [{key, label, kind: 'text'|'number'|'date'|'dropdown'|'toggle'|'textarea',
             options?, value?, placeholder?, desc?}]
   onSubmit(values) — called only when required fields validate. */
class FormModal extends Modal {
  constructor(app, { title, fields, submitLabel, onSubmit, validate }) {
    super(app);
    this.titleText = title;
    this.fields = fields;
    this.submitLabel = submitLabel || 'Save';
    this.onSubmit = onSubmit;
    this.validate = validate;
    this.values = {};
    this.components = {};
    for (const f of fields) this.values[f.key] = f.value ?? (f.kind === 'toggle' ? false : '');
  }

  onOpen() {
    this.modalEl.addClass('gv-modal');
    this.titleEl.setText(this.titleText);
    const c = this.contentEl;
    for (const f of this.fields) {
      const s = new Setting(c).setName(f.label);
      if (f.desc) s.setDesc(f.desc);
      if (f.kind === 'dropdown') {
        s.addDropdown(d => {
          this.components[f.key] = d;
          for (const [val, label] of f.options) d.addOption(val, label);
          d.setValue(String(this.values[f.key] ?? ''));
          d.onChange(v => { this.values[f.key] = v; if (f.onChange) f.onChange(v, this); });
        });
      } else if (f.kind === 'toggle') {
        s.addToggle(t => t.setValue(!!this.values[f.key]).onChange(v => { this.values[f.key] = v; }));
      } else if (f.kind === 'textarea') {
        s.addTextArea(t => {
          t.setValue(String(this.values[f.key] ?? ''));
          if (f.placeholder) t.setPlaceholder(f.placeholder);
          t.onChange(v => { this.values[f.key] = v; });
        });
      } else {
        s.addText(t => {
          if (f.kind === 'number') t.inputEl.type = 'number';
          if (f.kind === 'date') t.inputEl.type = 'date';
          if (f.placeholder) t.setPlaceholder(f.placeholder);
          t.setValue(String(this.values[f.key] ?? ''));
          t.onChange(v => { this.values[f.key] = v; });
        });
      }
    }
    this.errEl = c.createDiv({ cls: 'gv-modal-err' });
    new Setting(c).addButton(b => b.setButtonText(this.submitLabel).setCta().onClick(() => this.submit()));
  }

  submit() {
    const err = this.validate ? this.validate(this.values) : null;
    if (err) { this.errEl.setText(err); return; }
    this.close();
    // After close so a throwing handler can't strand a dead modal on screen.
    Promise.resolve(this.onSubmit(this.values)).catch(e => failed('save', e));
  }

  /* Repopulate a dropdown field's options after open, so one field can filter
     another (e.g. a muscle-group picker narrowing the exercise list). */
  setOptions(key, options) {
    const d = this.components[key];
    if (!d || !d.selectEl) return;
    d.selectEl.empty();
    for (const [val, label] of options) d.addOption(val, label);
    const first = options.length ? String(options[0][0]) : '';
    d.setValue(first);
    this.values[key] = first;
  }

  onClose() { this.contentEl.empty(); }
}

class ConfirmModal extends Modal {
  constructor(app, { title, message, confirmLabel, onConfirm }) {
    super(app);
    this.t = title; this.m = message; this.cl = confirmLabel || 'Delete'; this.onConfirm = onConfirm;
  }
  onOpen() {
    this.modalEl.addClass('gv-modal');
    this.titleEl.setText(this.t);
    this.contentEl.createEl('p', { text: this.m });
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setButtonText(this.cl).setWarning().onClick(() => {
        this.close();
        Promise.resolve(this.onConfirm()).catch(e => failed('delete', e));
      }));
  }
  onClose() { this.contentEl.empty(); }
}

/* Ending a session is a FORK, not a confirmation — the two ways out are save
   and discard, and the sheet has to name BOTH. It used to be a ConfirmModal
   titled "Discard session?", which meant the only route to *keeping* a
   workout ran under a heading that said the opposite: you tapped X (an icon
   that reads as cancel), landed on discard-flavoured chrome, and had to
   trust that "Bank it" was the save. Reported from a 0.10.2 smoke test.

   onReview is optional and exists for exactly one caller: the guided screen,
   where "back to the overview" is a third, non-committal way out AND the
   only route there, since the log page is not a nav tab. On the log page
   itself there is nothing to go back to, so it is left off. */
class EndSessionModal extends Modal {
  constructor(app, { onSave, onDiscard, onReview }) {
    super(app);
    this.onSave = onSave; this.onDiscard = onDiscard; this.onReview = onReview || null;
  }
  onOpen() {
    this.modalEl.addClass('gv-modal');
    this.titleEl.setText('End session');
    this.contentEl.createEl('p', { text: 'Save what you logged, or throw the session away.' });
    /* Order is Obsidian's: the way back first, the destructive next, the
       primary last and rightmost — so the save is under the thumb and the
       discard is not where a hurried tap lands. */
    const s = new Setting(this.contentEl)
      .addButton(b => b.setButtonText('Keep going').onClick(() => this.close()));
    if (this.onReview) {
      s.addButton(b => b.setButtonText('Back to the log').onClick(() => {
        this.close();
        this.onReview();
      }));
    }
    s.addButton(b => b.setButtonText('Discard').setWarning().onClick(() => {
      this.close();
      Promise.resolve(this.onDiscard()).catch(e => failed('discarding the session', e));
    }));
    s.addButton(b => b.setButtonText('Bank it').setCta().onClick(() => {
      this.close();
      Promise.resolve(this.onSave()).catch(e => failed('saving the session', e));
    }));
  }
  onClose() { this.contentEl.empty(); }
}

/* Switch which plan drives the dashboard. Parallel and fallback plans are
   listed too but not selectable — they are not alternatives, they fill in
   around whatever is active, and saying so beats hiding them. */
class PlanPickerModal extends Modal {
  constructor(app, { plans, extras, currentName, onPick }) {
    super(app);
    this.plans = plans; this.extras = extras || []; this.currentName = currentName; this.onPick = onPick;
  }
  onOpen() {
    this.modalEl.addClass('gv-modal');
    wearApp(this.modalEl);
    this.titleEl.setText('Switch plan');
    const c = this.contentEl;
    for (const p of this.plans) {
      const on = p.name === this.currentName;
      /* This modal's rows are its ONLY interactive content — before
         clickableCard these were plain createDiv()s with a click listener
         and no keyboard route at all, so there was no way to switch plans
         without a mouse/touch. */
      const row = clickableCard(
        { class: `gv-card gv-optrow${on ? ' on' : ''}` },
        () => {
          this.close();
          if (!on) Promise.resolve(this.onPick(p)).catch(e => failed('switching plan', e));
        },
        el('div', { class: 'gv-optrow-main' },
          el('div', { class: 'gv-optrow-name' }, p.name),
          el('div', { class: 'gv-optrow-desc' }, planSummary(p))),
        on ? el('div', { class: 'gv-optrow-desc' }, 'active') : '');
      c.append(row);
    }
    for (const p of this.extras) {
      const row = c.createDiv({ cls: 'gv-card gv-optrow gv-optrow-static' });
      const main = row.createDiv({ cls: 'gv-optrow-main' });
      main.createDiv({ cls: 'gv-optrow-name', text: p.name });
      main.createDiv({ cls: 'gv-optrow-desc',
        text: String(p.fm.fallback) === 'true'
          ? 'Fills any day your plan leaves empty — always on.'
          : 'Runs alongside whichever plan is active — always on.' });
    }
  }
  onClose() { this.contentEl.empty(); }
}

function planSummary(p) {
  const days = p.model.days.filter(d => d.items.length);
  return `${days.length} day${days.length === 1 ? '' : 's'} · ${days.map(d => d.weekday).join(', ')}`;
}

/* Body-map exercise picker — replaces the muscle dropdown in Add exercise.
   exercises: [{name: string, muscles: string[]}]
   onSubmit({exercise, sets, reps, weight}) */
class AddExerciseModal extends Modal {
  constructor(app, { title, exercises, onSubmit }) {
    super(app);
    this.titleText  = title;
    this.exercises  = exercises;   // [{name, muscles:[]}]
    this.onSubmit   = onSubmit;
    this._selSlug   = null;        // currently selected body-map slug
    this._selEx     = null;        // chosen exercise name
    this._map       = null;        // bodyMap controller
    this._exListEl  = null;
    this._errEl     = null;
    this._sets = '3'; this._reps = ''; this._weight = '';
  }

  onOpen() {
    wearApp(this.modalEl);
    this.modalEl.addClass('gv-modal gv-add-ex-modal');
    this.titleEl.setText(this.titleText);
    const c = this.contentEl;

    /* ---- body map ---- */
    const mapWrap = c.createDiv({ cls: 'gv-add-ex-map' });
    const allMuscles = [...new Set(this.exercises.flatMap(e => e.muscles))];
    this._map = bodyMap(mapWrap, {
      allMuscles,
      onMuscle: (slug) => {
        this._selSlug = slug;
        this._selEx = null;      // clear exercise selection when muscle changes
        this._renderList();
      },
    });

    /* muscle label row */
    this._muscleLbl = c.createDiv({ cls: 'gv-add-ex-muscle-lbl' });
    this._updateMuscleLabel();

    /* ---- exercise list ---- */
    this._exListEl = c.createDiv({ cls: 'gv-add-ex-list' });
    this._renderList();

    /* ---- form fields ---- */
    new Setting(c).setName('Sets').addText(t => {
      t.inputEl.type = 'number'; t.setValue('3');
      t.onChange(v => { this._sets = v; });
    });
    new Setting(c).setName('Reps').setDesc('Reps, a range, or seconds — prefills each set').addText(t => {
      t.setPlaceholder('8-12, 30-45s…');
      t.onChange(v => { this._reps = v; });
    });
    new Setting(c).setName('Weight (kg)').addText(t => {
      t.setPlaceholder('optional'); t.inputEl.type = 'number';
      t.onChange(v => { this._weight = v; });
    });

    this._errEl = c.createDiv({ cls: 'gv-modal-err' });
    new Setting(c).addButton(b => b.setButtonText('Add').setCta().onClick(() => this._submit()));
  }

  _filteredExercises() {
    if (!this._selSlug) return this.exercises;
    const appMuscles = SLUG_TO_APP[this._selSlug] || [];
    return this.exercises.filter(e => e.muscles.some(m => appMuscles.includes(m)));
  }

  _renderList() {
    this._updateMuscleLabel();
    const host = this._exListEl;
    while (host.firstChild) host.removeChild(host.firstChild);
    const list = this._filteredExercises();
    if (!list.length) {
      host.append(el('div', { class: 'gv-add-ex-empty' }, 'No exercises for this muscle group.'));
      return;
    }
    for (const ex of list) {
      const item = el('div', { class: 'gv-add-ex-item' + (this._selEx === ex.name ? ' on' : '') }, ex.name);
      item.onclick = () => { this._selEx = ex.name; this._renderList(); };
      host.append(item);
    }
  }

  _updateMuscleLabel() {
    if (!this._muscleLbl) return;
    if (this._selSlug) {
      const appNames = (SLUG_TO_APP[this._selSlug] || []).join(', ');
      this._muscleLbl.textContent = appNames;
      this._muscleLbl.classList.add('has-sel');
    } else {
      this._muscleLbl.textContent = 'All muscles';
      this._muscleLbl.classList.remove('has-sel');
    }
  }

  _submit() {
    if (!this._selEx) { this._errEl.setText('Pick an exercise from the list.'); return; }
    this.close();
    const sets = parseInt(this._sets, 10);
    const reps = String(this._reps || '').trim();
    const w    = String(this._weight || '').trim();
    const target = [reps, w ? `@ ${w}kg` : ''].filter(Boolean).join(' ').trim();
    Promise.resolve(this.onSubmit({
      exercise: this._selEx,
      sets: Number.isFinite(sets) && sets > 0 ? sets : null,
      target,
    })).catch(e => failed('save', e));
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = { FormModal, ConfirmModal, EndSessionModal, PlanPickerModal, AddExerciseModal };
