const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

// SAFE FETCH (Node 18+ ya node-fetch)
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

// ✅ New user notification helper
async function notifyNewUser(user) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ Telegram config missing for new user notify");
    return;
  }

  const text =
    "🆕 *New User Registered on PlayBell*\n\n" +
    `👤 *Name:* ${user.name || "-"}\n` +
    `🆔 *Username:* ${user.username}\n` +
    `📧 *Email:* ${user.email || "-"}\n` +
    `📱 *Phone:* ${user.phone || "-"}\n` +
    `✅ *Verified:* ${user.verified === false ? "Pending ❌" : "Verified ✅"}`;

  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
        }),
      }
    );

    const data = await res.json();
    if (!data.ok) {
      console.error("❌ Telegram new user notify error:", data);
    } else {
      console.log("✅ New user notification sent to Telegram:", user.username);
    }
  } catch (err) {
    console.error("❌ Telegram new user notify fetch error:", err.message);
  }
}

// ✅ Song request notification helper
async function notifySongRequest(reqData) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ Telegram config missing for song request notify");
    return;
  }

  const text =
    "🎵 *New Song Request*\n\n" +
    `🧑‍🎧 *User:* ${reqData.requestedBy}\n` +
    `🎼 *Title:* ${reqData.title}\n` +
    `🎤 *Artist:* ${reqData.artist}\n` +
    `⏳ *Status:* Pending review`;

  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
        }),
      }
    );

    const data = await res.json();
    if (!data.ok) {
      console.error("❌ Telegram song request notify error:", data);
    } else {
      console.log(
        "✅ Song request notification sent to Telegram:",
        reqData.title
      );
    }
  } catch (err) {
    console.error("❌ Telegram song request notify fetch error:", err.message);
  }
}

module.exports = { notifyNewUser, notifySongRequest };
