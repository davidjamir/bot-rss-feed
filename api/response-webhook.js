const { sendMessage } = require("../src/telegram");
const {
  buildResponseScheduletoTelegram,
} = require("../helper/handleListenerMessage");
function toStr(x) {
  return String(x == null ? "" : x).trim();
}

const CHAT_SOCIAL_NOTIFY = process.env.CHAT_SOCIAL_NOTIFY || "";

function buildResponsePublishToTelegram({
  status,
  page,
  title,
  text,
  topic,
  timeBangkok,
  timeNewyork,
} = {}) {
  const _title = (title || "New post").trim();
  const _page = (page || "").trim();
  const _topic = (topic || "").trim();

  const header = status
    ? "🚀🚀🚀 Success Published 🔥🔥🔥"
    : "❌❌❌ Failed Published 🔥🔥🔥";

  const parts = [];
  parts.push(`<b>${header}</b>`);
  parts.push(`<b>${_title}</b>`);
  if (_topic) lines.push(`Topic: ${_topic}`);
  if (_page) parts.push(`Page: ${_page}`);
  if (timeBangkok) parts.push(`<i>🕒 ${timeBangkok}</i>`);
  if (timeNewyork) parts.push(`<i>🕒 ${timeNewyork}</i>`);
  if (text) parts.push(text);

  return parts.join("\n");
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};
    const chatId = toStr(body.chatId);

    if (!chatId) {
      throw new Error("Missing chatId");
    }

    let message;
    if (body.type === "post-social") {
      message = buildResponsePublishToTelegram(body);
    }
    if (body.type === "schedule-social") {
      message = buildResponseScheduletoTelegram(body);
    }

    // gửi telegram
    await sendMessage(chatId, message);

    if (!body.status && CHAT_SOCIAL_NOTIFY) {
      await sendMessage(CHAT_SOCIAL_NOTIFY, message);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e?.message || e);

    return res.status(200).json({ ok: true });
  }
};
