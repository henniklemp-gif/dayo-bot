import cron from 'node-cron';
import { getTodayEvents, getWeekEvents } from './calendar.js';
import { getTodayWorkout } from './fitness.js';
import { formatDailyOverview, formatWeekOverview } from './format.js';

export function initScheduler(bot, userId) {
  // Jeden Morgen 07:30 Uhr
  cron.schedule('30 7 * * *', async () => {
    try {
      const [events, workout] = await Promise.all([getTodayEvents(), getTodayWorkout()]);
      const text = formatDailyOverview(events, workout);
      await bot.sendMessage(userId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Scheduler daily error:', err);
      bot.sendMessage(userId, 'Guten Morgen Henrik! 🌅 Kurzer Hinweis: Meine Morgenübersicht hat heute leider nicht funktioniert. 🙈');
    }
  }, { timezone: 'Europe/Berlin' });

  // Jeden Montag 08:00 Uhr
  cron.schedule('0 8 * * 1', async () => {
    try {
      const events = await getWeekEvents();
      const text = formatWeekOverview(events);
      await bot.sendMessage(userId, `🗓️ *Gute Woche Henrik!* Hier dein Wochenausblick:\n\n${text}`, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Scheduler weekly error:', err);
    }
  }, { timezone: 'Europe/Berlin' });

  console.log('⏰ Scheduler aktiv (täglich 07:30, montags 08:00 Europe/Berlin)');
}
