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

const BOT_TOKEN  = process.env.BOT_TOKEN;
const CHAT_ID    = process.env.CHAT_ID;
const PORT       = process.env.PORT || 4000;
const LOG_FILE   = path.join(__dirname, 'alerts-log.json');

const REPEAT_COUNT    = 5;
const REPEAT_DELAY_MS = 3_000; // 3 seconds between each message

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('ERROR: BOT_TOKEN and CHAT_ID must be set in .env');
  process.exit(1);
}

const app = express();
app.use(express.json());

// ── Alert log (persisted to alerts-log.json) ──────────────────────────────────
// pairTargets tracks how many alerts each pair has received this session.
// We restore counts from the log on startup so Target numbers survive restarts.
const pairTargets = {}; // { "BTCUSDT": 2, "ETHUSDT": 1, ... }

function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}

function appendLog(entry) {
  const log = readLog();
  log.push(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// Restore per-pair counts from existing log so numbering continues correctly.
(function restoreCounts() {
  for (const entry of readLog()) {
    if (entry.pair) {
      pairTargets[entry.pair] = Math.max(pairTargets[entry.pair] || 0, entry.targetNumber);
    }
  }
  console.log('[Log] Restored pair target counts:', pairTargets);
})();

// Try to extract a trading pair from the message text.
// Matches patterns like BTCUSDT, BTC/USDT, BTC-USD, btcusdt, etc.
function extractPair(message) {
  const m = message.match(/\b([A-Za-z]{2,6}[\/\-]?[A-Za-z]{2,6})\b/);
  return m ? m[1].toUpperCase().replace(/[-\/]/, '') : null;
}

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
async function sendBurst(message, pair, targetLabel) {
  console.log(`[Burst] Starting ${REPEAT_COUNT} messages — ${pair} ${targetLabel}: "${message}"`);
  for (let i = 1; i <= REPEAT_COUNT; i++) {
    try {
      const text = [
        `🚨 ${pair} — ${targetLabel}`,
        `Notification ${i}/${REPEAT_COUNT}`,
        ``,
        message,
      ].join('\n');
      await sendTelegram(text);
      console.log(`[Burst] Sent ${i}/${REPEAT_COUNT}`);
    } catch (err) {
      console.error(`[Burst] Failed to send message ${i}: ${err.message}`);
    }
    if (i < REPEAT_COUNT) await delay(REPEAT_DELAY_MS);
  }
  console.log(`[Burst] Done.`);
}

// ── Webhook endpoint ──────────────────────────────────────────────────────────
// Expected body: { "message": "...", "pair": "BTCUSDT" }
// "pair" is optional — falls back to auto-detection from the message text.
app.post('/webhook', (req, res) => {
  const { message, pair: pairField } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "message" field' });
  }

  const pair = (pairField || extractPair(message) || 'UNKNOWN').toUpperCase();

  // Increment target count for this pair
  pairTargets[pair] = (pairTargets[pair] || 0) + 1;
  const targetNumber = pairTargets[pair];
  const targetLabel  = `Target ${targetNumber}`;

  const entry = {
    timestamp:    new Date().toISOString(),
    pair,
    targetNumber,
    targetLabel,
    message,
  };
  appendLog(entry);

  console.log(`[Webhook] ${pair} ${targetLabel}: "${message}"`);

  // Respond immediately so TradingView doesn't time out
  res.json({ status: 'ok', pair, targetLabel, queued: REPEAT_COUNT });

  sendBurst(message, pair, targetLabel).catch(err =>
    console.error('[Burst] Unhandled error:', err)
  );
});

// ── Log viewer ────────────────────────────────────────────────────────────────
app.get('/log', (_req, res) => {
  const log = readLog();
  const rows = log
    .slice()
    .reverse()
    .map(e => `
      <tr>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td><strong>${e.pair}</strong></td>
        <td>${e.targetLabel}</td>
        <td>${e.message}</td>
      </tr>`)
    .join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Alert Log</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f13; color: #e8e8f0; padding: 1.5rem; }
    h1   { color: #7c6aff; font-size: 1.1rem; margin-bottom: 0.6rem; }
    .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .count { color: #888; font-size: 0.85rem; }
    button { background: #ff4455; color: #fff; border: none; border-radius: 6px; padding: 0.4rem 1rem; font-size: 0.85rem; cursor: pointer; }
    button:active { opacity: 0.8; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th   { text-align: left; color: #888; border-bottom: 1px solid #2e2e42; padding: 0.4rem 0.6rem; }
    td   { padding: 0.45rem 0.6rem; border-bottom: 1px solid #1e1e2e; word-break: break-word; }
    tr:hover td { background: #1a1a24; }
  </style>
</head>
<body>
  <h1>Alert Log</h1>
  <div class="toolbar">
    <span class="count">${log.length} alerts</span>
    <button onclick="resetLog()">Reset Log</button>
  </div>
  <table>
    <thead><tr><th>Time</th><th>Pair</th><th>Target</th><th>Message</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="color:#555;padding:1rem">No alerts yet.</td></tr>'}</tbody>
  </table>
  <script>
    setTimeout(() => location.reload(), 15000);
    function resetLog() {
      if (!confirm('Clear all alerts? This cannot be undone.')) return;
      fetch('/log/reset', { method: 'POST' })
        .then(() => location.reload());
    }
  </script>
</body>
</html>`);
});

// ── Reset log ─────────────────────────────────────────────────────────────────
app.post('/log/reset', (_req, res) => {
  fs.writeFileSync(LOG_FILE, '[]');
  for (const key of Object.keys(pairTargets)) delete pairTargets[key];
  console.log('[Log] Reset by user');
  res.json({ status: 'cleared' });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'running', pairTargets }));

app.listen(PORT, () => {
  console.log(`Telegram Alert Bot running on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook`);
  console.log(`Alert log:        GET  http://localhost:${PORT}/log`);
  console.log(`Chat ID: ${CHAT_ID}`);
});
