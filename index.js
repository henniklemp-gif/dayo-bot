import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import Anthropic from '@anthropic-ai/sdk';
import { getTodayEvents, getWeekEvents, createEvent, deleteEventByTitle } from './calendar.js';
import { getTodayWorkout, getStartDate, setStartDate, getPlanStatus } from './fitness.js';
import { getFridgeContents, addItems, removeItem } from './fridge.js';
import { initScheduler } from './scheduler.js';
import { analyzeReceipt } from './vision.js';
import { transcribeVoice } from './voice.js';
import { formatDailyOverview, formatWeekOverview } from './format.js';
import { startServer } from './server.js';

const WEBAPP_URL = process.env.WEBAPP_URL;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',').map(id => parseInt(id.trim(), 10));
const MY_ID = parseInt(process.env.MY_TELEGRAM_ID, 10);

const conversationHistory = {};

const KEYBOARD = {
  reply_markup: {
    keyboard: [
      ['📅 Heute', '📆 Woche'],
      ['🏋️ Training', '🍽️ Kochen'],
      ['🧊 Kühlschrank'],
    ],
    resize_keyboard: true,
    persistent: true,
  },
};

function allowed(userId) {
  return ALLOWED_USERS.includes(userId);
}

// Interpretiert einen ISO-String (z.B. "2026-06-30T12:00:00") als Berliner Ortszeit
// und gibt das korrekte UTC-Date-Objekt zurück.
function parseBerlinTime(isoString) {
  const probe = new Date(isoString + 'Z'); // als UTC lesen
  const berlinStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(probe).replace(' ', 'T');
  const offsetMs = new Date(berlinStr + 'Z').getTime() - probe.getTime();
  return new Date(probe.getTime() - offsetMs);
}

function err(chatId, error) {
  console.error(error);
  bot.sendMessage(chatId, 'Hm, da hat was nicht geklappt – versuch\'s nochmal! 🙈');
}

// ── COMMANDS ──────────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id, [
    'Hey Henrik! 👋 Ich bin Dayo, dein persönlicher Alltagsbegleiter.',
    '',
    '📅 *Kalender*',
    '/heute – Heutige Termine & Training',
    '/woche – Alle Termine der Woche',
    '"Erstelle Termin morgen 15 Uhr Zahnarzt" – Neuer Termin',
    '',
    '💪 *Fitness*',
    '/training – Heutiger Trainingsplan',
    '"Ich habe am 1. Juni angefangen" – Plantag setzen',
    '',
    '🧊 *Kühlschrank*',
    '/kuehlschrank – Was ist noch da?',
    '/kochen – Was kann ich heute kochen?',
    'Kassenbon-Foto oder PDF schicken → wird eingetragen',
    '"Ich habe die Milch aufgebraucht" → wird entfernt',
    '',
    '🎙️ *Sprachnachrichten funktionieren auch für alles!*',
  ].join('\n'), { parse_mode: 'Markdown', ...KEYBOARD });
});

bot.onText(/\/heute/, async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  try {
    const [events, workout] = await Promise.all([getTodayEvents(), getTodayWorkout()]);
    bot.sendMessage(msg.chat.id, formatDailyOverview(events, workout), { parse_mode: 'Markdown' });
  } catch (e) { err(msg.chat.id, e); }
});

bot.onText(/\/woche/, async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  try {
    const events = await getWeekEvents();
    bot.sendMessage(msg.chat.id, formatWeekOverview(events), { parse_mode: 'Markdown' });
  } catch (e) { err(msg.chat.id, e); }
});

bot.onText(/\/training/, async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  try {
    const workout = getTodayWorkout();
    const status  = getPlanStatus();
    if (!workout || !workout.train) {
      bot.sendMessage(msg.chat.id, 'Heute ist Ruhetag – gönn dir! 😴\nVielleicht ein kurzer Spaziergang?');
      return;
    }
    const dayInfo = status.active ? ` *(Tag ${status.planDay}/50, Phase ${status.phase})*` : '';
    bot.sendMessage(
      msg.chat.id,
      `${workout.icon} *Heutiges Training*${dayInfo}\n\n*${workout.type}*\n_${workout.desc}_`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) { err(msg.chat.id, e); }
});

bot.onText(/\/kuehlschrank/, (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  if (WEBAPP_URL) {
    bot.sendMessage(msg.chat.id, '🧊 Kühlschrank öffnen:', {
      reply_markup: { inline_keyboard: [[{ text: '🧊 Kühlschrank öffnen', web_app: { url: WEBAPP_URL } }]] }
    });
    return;
  }
  const items = getFridgeContents();
  if (items.length === 0) {
    bot.sendMessage(msg.chat.id, 'Dein Kühlschrank ist leer! 🫙 Schick mir einen Kassenbon zum Befüllen.');
    return;
  }
  const list = items.map(i => `• ${i.name}${i.quantity != null ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join('\n');
  bot.sendMessage(msg.chat.id, `🧊 *Dein Kühlschrank:*\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/kochen/, async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  await handleCookingSuggestion(msg.chat.id);
});

// ── FOTOS & DOKUMENTE (Kassenbon) ─────────────────────────────────────────────

bot.on('photo', async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  const status = await bot.sendMessage(chatId, '📸 Kassenbon erkannt! Analysiere gerade...');
  try {
    const photo   = msg.photo[msg.photo.length - 1];
    const fileUrl = await bot.getFileLink(photo.file_id);
    const res     = await fetch(fileUrl);
    const buffer  = Buffer.from(await res.arrayBuffer());
    const items   = await analyzeReceipt(buffer, 'image/jpeg');
    addItems(items);
    bot.editMessageText(
      items.length > 0
        ? `✅ *${items.length} Produkte erkannt und eingetragen:*\n\n${items.map(i => `• ${i.name}${i.quantity != null ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join('\n')}`
        : 'Hmm, ich konnte keine Lebensmittel auf dem Bon erkennen. 🤔 Probier ein klareres Foto!',
      { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) { err(chatId, e); }
});

bot.on('document', async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  const doc = msg.document;
  if (!doc.mime_type?.includes('pdf') && !doc.mime_type?.includes('image')) return;
  const status = await bot.sendMessage(chatId, '📄 Kassenbon-PDF erkannt! Analysiere gerade...');
  try {
    const fileUrl = await bot.getFileLink(doc.file_id);
    const res     = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`);
    const buffer  = Buffer.from(await res.arrayBuffer());
    console.log(`[PDF] Datei geladen: ${buffer.length} Bytes, MIME: ${doc.mime_type}`);
    const items   = await analyzeReceipt(buffer, doc.mime_type);
    addItems(items);
    bot.editMessageText(
      items.length > 0
        ? `✅ *${items.length} Produkte erkannt und eingetragen:*\n\n${items.map(i => `• ${i.name}${i.quantity != null ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join('\n')}`
        : 'Hmm, keine Lebensmittel gefunden. 🤔 Vielleicht mal als Foto probieren?',
      { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.error('[PDF] Fehler:', e);
    const errorMsg = e?.status ? `API-Fehler ${e.status}: ${e?.error?.error?.message ?? e.message}` : e.message;
    bot.editMessageText(
      `❌ Fehler beim Scannen:\n\`${errorMsg}\``,
      { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
    );
  }
});

// ── SPRACHNACHRICHTEN ─────────────────────────────────────────────────────────

bot.on('voice', async (msg) => {
  if (!msg.from || !allowed(msg.from.id)) return;
  msg.handled = true;
  const chatId = msg.chat.id;
  try {
    const fileInfo = await bot.getFile(msg.voice.file_id);
    const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
    const text     = await transcribeVoice(fileUrl);
    await handleTextIntent(chatId, text);
  } catch (e) {
    bot.sendMessage(chatId, 'Hm, die Sprachnachricht hab ich nicht verstanden 🙈');
  }
});

// ── TEXTNACHRICHTEN → Intent-Erkennung + Claude-Chat ─────────────────────────

// Emojis und Variation Selectors entfernen für robusten Key-Vergleich
function stripEmojis(text) {
  return text.replace(/[\p{Emoji}️‍]/gu, '').trim();
}

// Keys OHNE Emojis – müssen mit stripEmojis(buttonText) übereinstimmen
const KEYBOARD_SHORTCUTS = {
  'Heute':        async (chatId) => { const [e, w] = await Promise.all([getTodayEvents(), getTodayWorkout()]); bot.sendMessage(chatId, formatDailyOverview(e, w), { parse_mode: 'Markdown' }); },
  'Woche':        async (chatId) => { bot.sendMessage(chatId, formatWeekOverview(await getWeekEvents()), { parse_mode: 'Markdown' }); },
  'Training':     async (chatId) => {
    const workout = getTodayWorkout();
    const status  = getPlanStatus();
    if (!workout || !workout.train) {
      bot.sendMessage(chatId, 'Heute ist Ruhetag – gönn dir! 😴\nVielleicht ein kurzer Spaziergang?');
      return;
    }
    const dayInfo = status.active ? ` *(Tag ${status.planDay}/50, Phase ${status.phase})*` : '';
    bot.sendMessage(chatId, `${workout.icon} *Heutiges Training*${dayInfo}\n\n*${workout.type}*\n_${workout.desc}_`, { parse_mode: 'Markdown' });
  },
  'Kochen':       async (chatId) => handleCookingSuggestion(chatId),
  'Kühlschrank':  async (chatId) => {
    if (WEBAPP_URL) {
      await bot.sendMessage(chatId, '🧊 Kühlschrank öffnen:', {
        reply_markup: { inline_keyboard: [[{ text: '🧊 Kühlschrank öffnen', web_app: { url: WEBAPP_URL } }]] }
      });
      return;
    }
    const items = getFridgeContents();
    if (!items.length) { await bot.sendMessage(chatId, 'Dein Kühlschrank ist leer! 🫙'); return; }
    await bot.sendMessage(chatId, `🧊 *Dein Kühlschrank:*\n\n${items.map(i => `• ${i.name}${i.quantity != null ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join('\n')}`, { parse_mode: 'Markdown' });
  },
};

async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const text   = msg.text;
  try {
    const key = stripEmojis(text.trim());
    const shortcut = KEYBOARD_SHORTCUTS[key];
    if (shortcut) { await shortcut(chatId); return; }
    await handleTextIntent(chatId, text);
  } catch (e) {
    err(chatId, e);
  }
}

bot.on('message', async (msg) => {
  if (msg.handled) return;
  if (msg.voice) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!msg.from || !allowed(msg.from.id)) return;
  await handleTextMessage(msg);
});

async function handleTextIntent(chatId, text) {
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Berlin',
  });

  let parsed;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Analysiere diese Nachricht von Henrik und bestimme die Absicht. Antworte NUR mit JSON.

Nachricht: "${text}"
Heute: ${today}

Intents:
- create_event: Termin erstellen → data: { title: string, startISO: "YYYY-MM-DDTHH:MM:00", durationMinutes: number (default 60) }
- query_today: Heutige Termine abfragen → data: {}
- query_week: Wochenübersicht → data: {}
- remove_fridge: Lebensmittel aus Kühlschrank entfernen → data: { items: string[] }
- query_fridge: Kühlschrank anzeigen → data: {}
- cooking_suggestion: Kochvorschlag → data: {}
- delete_event: Termin löschen → data: { title: string, dateISO: "YYYY-MM-DD" }
- set_fitness_start: Fitness-Startdatum setzen → data: { dateISO: "YYYY-MM-DD" }
- chat: Allgemeines Gespräch → data: {}

JSON-Format: {"intent": "...", "data": {...}}`,
      }],
    });
    const raw   = response.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    bot.sendMessage(chatId, 'Das hab ich leider nicht ganz verstanden – kannst du das nochmal anders sagen? 😅');
    return;
  }

  try {
    switch (parsed.intent) {

      case 'create_event': {
        const { title, startISO, durationMinutes = 60 } = parsed.data;
        const start = parseBerlinTime(startISO);
        const end   = new Date(start.getTime() + durationMinutes * 60000);
        await createEvent(title, start, end);
        const dateStr = start.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' });
        const timeStr = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        bot.sendMessage(chatId, `✅ Eingetragen! 📅\n\n*${title}*\n${dateStr} um ${timeStr} Uhr`, { parse_mode: 'Markdown' });
        break;
      }

      case 'query_today': {
        const [events, workout] = await Promise.all([getTodayEvents(), getTodayWorkout()]);
        bot.sendMessage(chatId, formatDailyOverview(events, workout), { parse_mode: 'Markdown' });
        break;
      }

      case 'query_week': {
        const events = await getWeekEvents();
        bot.sendMessage(chatId, formatWeekOverview(events), { parse_mode: 'Markdown' });
        break;
      }

      case 'remove_fridge': {
        const { items } = parsed.data;
        const removed = items.filter(i => removeItem(i));
        if (removed.length > 0) {
          bot.sendMessage(chatId, `🗑️ Raus damit! ${removed.map(i => `*${i}*`).join(', ')} ${removed.length > 1 ? 'sind' : 'ist'} nicht mehr im Kühlschrank.`, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(chatId, 'Hmm, ich hab das nicht im Kühlschrank gefunden. 🤔');
        }
        break;
      }

      case 'query_fridge': {
        if (WEBAPP_URL) {
          bot.sendMessage(chatId, '🧊 Kühlschrank öffnen:', {
            reply_markup: { inline_keyboard: [[{ text: '🧊 Kühlschrank öffnen', web_app: { url: WEBAPP_URL } }]] }
          });
          break;
        }
        const contents = getFridgeContents();
        if (contents.length === 0) {
          bot.sendMessage(chatId, 'Dein Kühlschrank ist leer! 🫙');
        } else {
          const list = contents.map(i => `• ${i.name}${i.quantity != null ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join('\n');
          bot.sendMessage(chatId, `🧊 *Dein Kühlschrank:*\n\n${list}`, { parse_mode: 'Markdown' });
        }
        break;
      }

      case 'cooking_suggestion':
        await handleCookingSuggestion(chatId);
        break;

      case 'delete_event': {
        const { title, dateISO } = parsed.data;
        const deleted = await deleteEventByTitle(title, new Date(dateISO));
        if (deleted) {
          bot.sendMessage(chatId, `🗑️ Gelöscht: *${deleted}*`, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(chatId, `Hmm, ich hab keinen Termin gefunden der zu "${title}" passt. 🤔`);
        }
        break;
      }

      case 'set_fitness_start': {
        const { dateISO } = parsed.data;
        setStartDate(new Date(dateISO));
        const dateStr = new Date(dateISO).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
        bot.sendMessage(chatId, `💪 Fitness-Plan Startdatum gesetzt: *${dateStr}*\nAb jetzt kenn ich deinen genauen Trainingstag!`, { parse_mode: 'Markdown' });
        break;
      }

      case 'chat': {
        if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
        conversationHistory[chatId].push({ role: 'user', content: text });
        if (conversationHistory[chatId].length > 10) conversationHistory[chatId].shift();

        const chatResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: `Du bist Dayo, Henriks persönlicher Alltagsbegleiter. Locker, freundlich, auf Augenhöhe – wie ein guter Kumpel. Kurze klare Antworten auf Deutsch. Gerne mal ein Emoji, aber nicht übertreiben. Nenn ihn Henrik oder du. Heute ist ${new Date().toLocaleDateString('de-DE')}.`,
          messages: conversationHistory[chatId],
        });

        const reply = chatResponse.content[0].text;
        conversationHistory[chatId].push({ role: 'assistant', content: reply });
        bot.sendMessage(chatId, reply);
        break;
      }

      default:
        bot.sendMessage(chatId, 'Hmm, das hab ich nicht ganz einordnen können. Was kann ich für dich tun? 😊');
    }
  } catch (e) {
    err(chatId, e);
  }
}

// ── KOCHVORSCHLAG ─────────────────────────────────────────────────────────────

async function handleCookingSuggestion(chatId) {
  const contents = getFridgeContents();
  if (contents.length === 0) {
    bot.sendMessage(chatId, 'Dein Kühlschrank ist leer – erst einkaufen, dann kochen! 😄');
    return;
  }
  const status = await bot.sendMessage(chatId, '🍳 Überlege was du kochen kannst...');
  const zutaten = contents.map(i => `${i.name}${i.quantity != null ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join(', ');
  const workout = getTodayWorkout();
  const trainingCtx = workout?.train
    ? `Heute ist Trainingstag (${workout.type}) – etwas mehr Protein wäre gut.`
    : 'Heute ist Ruhetag.';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Mach Henrik einen konkreten Essensvorschlag basierend auf diesen Zutaten: ${zutaten}

Fitness-Kontext: ${trainingCtx} Kalorienziel: 2.200–2.400 kcal/Tag, 150–170 g Protein.

1–2 konkrete Gerichte vorschlagen, die zu den vorhandenen Zutaten passen. Locker, auf Deutsch, kurz & knackig. Sparsam mit Emojis.`,
    }],
  });

  bot.editMessageText(response.content[0].text, {
    chat_id: chatId, message_id: status.message_id,
  });
}

// ── START ─────────────────────────────────────────────────────────────────────

initScheduler(bot, MY_ID);
startServer();
console.log('🤖 Dayo läuft!');
