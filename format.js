export function formatMorningOverview(events, workout, quote, btcPrice) {
  let text = '';
  if (quote) text += `_${quote}_\n\n`;
  text += formatDailyOverview(events, workout);
  if (btcPrice != null) {
    const priceStr = btcPrice.toLocaleString('en-US', { maximumFractionDigits: 0 });
    text += `\n\n₿ *Bitcoin:* $${priceStr}`;
  }
  return text;
}

export function formatDailyOverview(events, workout) {
  const today = new Date();
  const dayStr = today.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin',
  });

  const greetings = [
    'Hey Henrik! ☀️',
    'Moin Henrik! 🌅',
    'Na du! 👋',
    'Hey! ☕',
    'Guten Morgen Henrik! 🌤️',
  ];
  const greeting = greetings[today.getDay() % greetings.length];

  let text = `${greeting} Hier ist dein ${dayStr}:\n\n`;

  if (!events || events.length === 0) {
    text += '📅 *Termine:* Heute nix – freier Tag! 🎉\n\n';
  } else {
    text += '📅 *Termine heute:*\n';
    for (const e of events) {
      const time = e.allDay ? 'Ganztägig' : `${e.startTime} Uhr`;
      const cal  = e.calendar === 'Privat' ? ' 💑' : '';
      text += `• ${time} – ${e.title}${cal}\n`;
    }
    text += '\n';
  }

  if (workout && workout.train) {
    text += `💪 *Training:* ${workout.icon} ${workout.type}\n_${workout.desc}_`;
  } else {
    text += '😴 *Training:* Ruhetag – gut erholen!';
  }

  return text;
}

export function formatWeekOverview(events) {
  let text = '📅 *Deine Woche im Überblick:*\n\n';

  if (!events || events.length === 0) {
    text += 'Diese Woche noch nix eingetragen – entspannt! 😎';
    return text;
  }

  const byDay = {};
  for (const e of events) {
    if (!byDay[e.dateStr]) byDay[e.dateStr] = [];
    byDay[e.dateStr].push(e);
  }

  for (const [dateStr, dayEvents] of Object.entries(byDay)) {
    text += `*${dateStr}*\n`;
    for (const e of dayEvents) {
      const time = e.allDay ? 'Ganztägig' : `${e.startTime} Uhr`;
      const cal  = e.calendar === 'Privat' ? ' 💑' : '';
      text += `• ${time} – ${e.title}${cal}\n`;
    }
    text += '\n';
  }

  return text.trimEnd();
}
