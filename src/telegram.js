const { formatItem } = require("../helper/helperTelegram");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function tg(method, payload) {
  if (!BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload || {}),
  });
  const data = await r.json();
  if (!data.ok)
    throw new Error(`Telegram ${method} error: ${JSON.stringify(data)}`);
  return data.result;
}

async function sendMessage(chat_id, text) {
  return tg("sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

async function getChat(chat_id) {
  return tg("getChat", { chat_id });
}

// check quyền của user đối với chat/channel target
async function getUserMember(targetChatId, userId) {
  return tg("getChatMember", { chat_id: targetChatId, user_id: userId });
}

function isAdminLike(member) {
  return member?.status === "administrator" || member?.status === "creator";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendTelegram(payload) {
  const chatId = payload.chatId;
  const items = payload.items || [];
  const source = payload.source || {};
  const successLinks = [];

  if (!chatId || !items.length) return;

  // gửi theo thứ tự cũ → mới
  for (const item of items) {
    const text = formatItem(item, source.feedTitle || "", source.feedUrl || "");

    try {
      await sendMessage(chatId, text);
      successLinks.push(item.link);
    } catch (err) {
      console.error("Telegram send error:", err?.response?.data || err.message);

      // Rate limit retry 1 lần
      if (err?.response?.status === 429) {
        const retryAfter = err.response.data?.parameters?.retry_after || 3;
        await sleep(retryAfter * 1000);

        try {
          await sendMessage(chatId, text);
          successLinks.push(item.link);
          continue; // retry thành công thì tiếp
        } catch (retryErr) {
          throw {
            error: retryErr,
            successLinks,
          };
        }
      }
      throw {
        error: err,
        successLinks,
      };
    }

    await sleep(100);
  }
}

module.exports = {
  tg,
  sendMessage,
  getChat,
  getUserMember,
  isAdminLike,
  sendTelegram,
};
