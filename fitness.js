import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, 'fitness-state.json');

let _data = null;

function loadFitnessData() {
  if (_data) return _data;
  const html = readFileSync(join(__dirname, 'fitnessplan.html'), 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error('Kein Script-Block im Fitness-HTML gefunden');
  const script = scriptMatch[1];
  const phasesMatch = script.match(/const PHASES = \[[\s\S]*?\];/);
  const schedMatch  = script.match(/const WEEK_SCHED = \[[\s\S]*?\];/);
  if (!phasesMatch || !schedMatch) throw new Error('Fitness-Daten nicht gefunden');
  _data = vm.runInNewContext(
    `${phasesMatch[0]}\n${schedMatch[0]}\n({ PHASES, WEEK_SCHED })`,
    {},
    { timeout: 2000 }
  );
  return _data;
}

function buildDays() {
  const { PHASES, WEEK_SCHED } = loadFitnessData();
  return Array.from({ length: 50 }, (_, i) => {
    const n  = i + 1;
    const wi = i % 7;
    const s  = WEEK_SCHED[wi];
    const pi = n >= 29 ? 2 : n >= 15 ? 1 : 0;
    const ph = PHASES[pi];
    if (s.train) {
      const sess = ph.sessions[s.sIdx];
      return { day: n, dow: s.day, train: true, type: sess.type, icon: sess.icon, desc: sess.desc, phase: pi + 1 };
    }
    return { day: n, dow: s.day, train: false, type: s.type, icon: s.icon, desc: '', phase: pi + 1 };
  });
}

export function getStartDate() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return state.startDate ? new Date(state.startDate) : null;
  } catch {
    return null;
  }
}

export function setStartDate(date) {
  writeFileSync(STATE_FILE, JSON.stringify({ startDate: date.toISOString().slice(0, 10) }));
}

function getPlanDay() {
  const startDate = getStartDate();
  if (!startDate) return null;
  const now = new Date();
  const diffMs = now.setHours(0, 0, 0, 0) - new Date(startDate).setHours(0, 0, 0, 0);
  const day = Math.floor(diffMs / 86400000) + 1;
  return day >= 1 && day <= 50 ? day : null;
}

export function getTodayWorkout() {
  const today = new Date();
  const dowMap = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' };
  const dow = dowMap[today.getDay()];
  const planDay = getPlanDay();

  if (planDay !== null) {
    const all = buildDays();
    return all[planDay - 1] || null;
  }

  // Fallback: show workout by weekday, generic phase
  const { PHASES, WEEK_SCHED } = loadFitnessData();
  const s = WEEK_SCHED.find(w => w.dow === dow || w.day === dow);
  if (!s || !s.train) return null;
  const sess = PHASES[0].sessions[s.sIdx];
  return { day: null, dow, train: true, type: sess.type, icon: sess.icon, desc: sess.desc, phase: 1 };
}

export function getWorkoutForDayNum(n) {
  if (n < 1 || n > 50) return null;
  return buildDays()[n - 1];
}

export function getPlanStatus() {
  const planDay = getPlanDay();
  if (!planDay) return { active: false };
  const all = buildDays();
  const today = all[planDay - 1];
  const trainDays = all.filter(d => d.train).length;
  return { active: true, planDay, totalDays: 50, phase: today?.phase ?? 1 };
}
