// Load .env if present (no dotenv dependency — parse manually)
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const express = require('express');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;
const PORT      = process.env.PORT || 4000;

const REPEAT_COUNT    = 5;
const REPEAT_DELAY_MS = 5_000; // 5 seconds between each message

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('ERROR: BOT_TOKEN and CHAT_ID must be set in .env');
  process.exit(1);
}

const app = express();
app.use(express.json());

// ── Telegram helper ───────────────────────────────────────────────────────────
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram error: ${json.description}`);
  return json;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Send REPEAT_COUNT messages with REPEAT_DELAY_MS between each.
// Runs in the background — does not block the webhook response.
async function sendBurst(message) {
  console.log(`[Burst] Starting — will send ${REPEAT_COUNT} messages for: "${message}"`);
  for (let i = 1; i <= REPEAT_COUNT; i++) {
    try {
      await sendTelegram(`🚨 Alert ${i}/${REPEAT_COUNT}\n\n${message}`);
      console.log(`[Burst] Sent message ${i}/${REPEAT_COUNT}`);
    } catch (err) {
      console.error(`[Burst] Failed to send message ${i}: ${err.message}`);
    }
    if (i < REPEAT_COUNT) await delay(REPEAT_DELAY_MS);
  }
  console.log(`[Burst] Done.`);
}

// ── Webhook endpoint ──────────────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "message" field' });
  }

  console.log(`[Webhook] Received: "${message}"`);

  // Respond immediately so TradingView doesn't time out
  res.json({ status: 'ok', queued: REPEAT_COUNT });

  // Fire and forget the burst
  sendBurst(message).catch(err => console.error('[Burst] Unhandled error:', err));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'running' }));

app.listen(PORT, () => {
  console.log(`Telegram Alert Bot running on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook`);
  console.log(`Chat ID: ${CHAT_ID}`);
});
