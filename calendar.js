import { createDAVClient } from 'tsdav';
import { v4 as uuidv4 } from 'uuid';

let client = null;
let calendarsCache = null;

async function getClient() {
  if (client) return client;
  client = await createDAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: {
      username: process.env.MY_ICLOUD_EMAIL,
      password: process.env.MY_ICLOUD_PASSWORD,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  return client;
}

async function getCalendars() {
  if (calendarsCache) return calendarsCache;
  const c = await getClient();
  calendarsCache = await c.fetchCalendars();
  return calendarsCache;
}

async function getCalendarByName(name) {
  const calendars = await getCalendars();
  return calendars.find(
    cal => cal.displayName === name || cal.displayName?.toLowerCase().includes(name.toLowerCase())
  );
}

function unfold(ics) {
  return ics.replace(/\r?\n[ \t]/g, '');
}

function unescape(val) {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseICSDateTime(raw) {
  const value = raw.includes(':') ? raw.split(':').pop() : raw;
  if (value.length === 8) {
    return {
      date: new Date(
        parseInt(value.slice(0, 4)),
        parseInt(value.slice(4, 6)) - 1,
        parseInt(value.slice(6, 8))
      ),
      allDay: true,
    };
  }
  const y  = parseInt(value.slice(0, 4));
  const mo = parseInt(value.slice(4, 6)) - 1;
  const d  = parseInt(value.slice(6, 8));
  const h  = parseInt(value.slice(9, 11));
  const m  = parseInt(value.slice(11, 13));
  const s  = parseInt(value.slice(13, 15) || '0');
  const date = value.endsWith('Z')
    ? new Date(Date.UTC(y, mo, d, h, m, s))
    : new Date(y, mo, d, h, m, s);
  return { date, allDay: false };
}

function parseVEvents(icsData, calendarName) {
  const unfolded = unfold(icsData);
  const events = [];
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = re.exec(unfolded)) !== null) {
    const block = match[1];
    const props = {};
    for (const line of block.split(/\r?\n/).filter(Boolean)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const keyFull = line.slice(0, colonIdx);
      const key = keyFull.split(';')[0].toUpperCase();
      props[key] = { raw: keyFull, value: line.slice(colonIdx + 1) };
    }
    if (!props['SUMMARY'] || !props['DTSTART']) continue;
    const { date: start, allDay } = parseICSDateTime(
      props['DTSTART'].raw + ':' + props['DTSTART'].value
    );
    const end = props['DTEND']
      ? parseICSDateTime(props['DTEND'].raw + ':' + props['DTEND'].value).date
      : null;
    events.push({
      title: unescape(props['SUMMARY'].value),
      start,
      end,
      allDay,
      calendar: calendarName,
    });
  }
  return events;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatTime(date) {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });
}

function formatDateShort(date) {
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Berlin',
  });
}

async function fetchEventsInRange(calendar, start, end) {
  if (!calendar) return [];
  const c = await getClient();
  const objects = await c.fetchCalendarObjects({
    calendar,
    timeRange: { start: start.toISOString(), end: end.toISOString() },
  });
  return objects.flatMap(obj => parseVEvents(obj.data || '', calendar.displayName || ''));
}

function mapEvent(e) {
  return {
    title: e.title,
    calendar: e.calendar,
    allDay: e.allDay,
    startTime: e.allDay ? null : formatTime(e.start),
    dateStr: formatDateShort(e.start),
    start: e.start,
  };
}

export async function getTodayEvents() {
  const now = new Date();
  const start = startOfDay(now);
  const end   = endOfDay(now);
  const [henrik, privat] = await Promise.all([
    getCalendarByName('Henrik').then(cal => fetchEventsInRange(cal, start, end)),
    getCalendarByName('Privat').then(cal => fetchEventsInRange(cal, start, end)),
  ]);
  return [...henrik, ...privat]
    .filter(e => e.start >= start && e.start <= end)
    .sort((a, b) => a.start - b.start)
    .map(mapEvent);
}

export async function getWeekEvents() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const start = startOfDay(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const end = endOfDay(sunday);
  const [henrik, privat] = await Promise.all([
    getCalendarByName('Henrik').then(cal => fetchEventsInRange(cal, start, end)),
    getCalendarByName('Privat').then(cal => fetchEventsInRange(cal, start, end)),
  ]);
  return [...henrik, ...privat]
    .filter(e => e.start >= start && e.start <= end)
    .sort((a, b) => a.start - b.start)
    .map(mapEvent);
}

function toICSDateTime(date) {
  return date
    .toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' })
    .replace(/[-:]/g, '')
    .replace(' ', 'T');
}

export async function createEvent(title, start, end) {
  const calendar = await getCalendarByName('Henrik');
  if (!calendar) throw new Error('Kalender "Henrik" nicht gefunden');
  const c = await getClient();
  const uid = `${uuidv4()}@dayo`;
  const now = toICSDateTime(new Date());
  const dtStart = toICSDateTime(start);
  const dtEnd = toICSDateTime(end);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dayo Bot//Dayo//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=Europe/Berlin:${dtStart}`,
    `DTEND;TZID=Europe/Berlin:${dtEnd}`,
    `SUMMARY:${title}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  await c.createCalendarObject({
    calendar,
    filename: `${uid}.ics`,
    iCalString: ics,
  });
}

export async function listCalendarNames() {
  const cals = await getCalendars();
  return cals.map(c => c.displayName || c.url);
}

export async function deleteEventByTitle(searchTitle, date) {
  const c   = await getClient();
  const cal = await getCalendarByName('Henrik');
  if (!cal) throw new Error('Kalender "Henrik" nicht gefunden');

  const objects = await c.fetchCalendarObjects({
    calendar: cal,
    timeRange: { start: startOfDay(date).toISOString(), end: endOfDay(date).toISOString() },
  });

  const lower = searchTitle.toLowerCase();
  const match = objects.find(obj => {
    const m = unfold(obj.data || '').match(/SUMMARY:([^\r\n]+)/);
    return m ? unescape(m[1]).toLowerCase().includes(lower) : false;
  });

  if (!match) return null;

  const titleMatch = unfold(match.data || '').match(/SUMMARY:([^\r\n]+)/);
  const title = titleMatch ? unescape(titleMatch[1]) : searchTitle;

  await c.deleteCalendarObject({ calendarObject: match });
  return title;
}
