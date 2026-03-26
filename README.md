# Telegram Alert Bot

When a TradingView alert fires, this bot sends **5 Telegram messages** to your chat, each 10 seconds apart, so you can't miss it.

---

## Setup

### 1. Create a Telegram bot

1. Open Telegram and message **@BotFather**.
2. Send `/newbot`, follow the prompts, and copy the **bot token** it gives you.

### 2. Get your Chat ID

1. Add your bot to a group, or start a direct chat with it.
2. Send any message to the chat.
3. Open this URL in your browser (replace `<TOKEN>`):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
4. Find `"chat":{"id": ...}` in the response — that number is your **Chat ID**.
   - Direct chats: a positive number (e.g. `123456789`)
   - Groups: a negative number (e.g. `-1001234567890`)

### 3. Configure .env

```bash
cp .env.example .env
```

Edit `.env`:
```
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
CHAT_ID=-1001234567890
PORT=4000
```

### 4. Install and start

```bash
npm install
npm start
```

---

## Expose with ngrok

TradingView needs a public URL to post webhooks to.

```bash
ngrok http 4000
```

Your webhook URL will be:
```
https://abc123.ngrok-free.app/webhook
```

---

## Set the webhook in TradingView

1. Open a chart → **Alerts** → **Create Alert**.
2. In the **Notifications** tab, enable **Webhook URL**.
3. Paste:
   ```
   https://abc123.ngrok-free.app/webhook
   ```
4. Set the **Message** body to:
   ```json
   {"message": "BUY signal on BTCUSDT"}
   ```
5. Save the alert.

When the alert fires, your Telegram chat will receive:

```
🚨 Alert 1/5

BUY signal on BTCUSDT
```
...10 seconds later...
```
🚨 Alert 2/5

BUY signal on BTCUSDT
```
...and so on up to 5 times.

---

## Test manually

```bash
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": "Test alert fired"}'
```

---

## Configuration

Edit the constants at the top of `bot.js` if you want to change the repeat count or delay:

```js
const REPEAT_COUNT    = 5;
const REPEAT_DELAY_MS = 10_000; // 10 seconds
```
