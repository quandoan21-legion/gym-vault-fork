'use strict';
/* The Focus page carries a one-tap button that launches the iOS "Pomodoro
   Start" Shortcut (which drives the 25-5-25-5-25-5-25-10 Focus-automation
   cycle and logs each focus session back to the daily note). The button is
   the only in-app entry point to that cycle, so pin that it exists and points
   at the right Shortcut via the shortcuts:// scheme. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'page-pomodoro.js'), 'utf8');

assert.match(src, /shortcuts:\/\/run-shortcut\?name=Pomodoro%20Start/,
  'Focus page must launch the "Pomodoro Start" Shortcut via the shortcuts:// scheme');
assert.match(src, /Bắt đầu Pomodoro/,
  'the start button must be labelled for the user');

console.log('pomodoro start button OK (Focus page launches the Pomodoro Start Shortcut)');
