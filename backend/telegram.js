const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

// ✅ Global fetch (Node 18+) ya node-fetch fallback
let fetchFn = global.fetch;

if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ Telegram config missing (token or chat id)");
    return;
  }

  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
        }),
      }
    );

    const data = await res.json();
    if (!data.ok) {
      console.error("❌ Telegram API error:", data);
    } else {
      console.log("✅ Telegram message sent:", data.result.message_id);
    }
  } catch (err) {
    console.error("❌ Telegram Error:", err.message);
  }
}

module.exports = { sendTelegramMessage };
