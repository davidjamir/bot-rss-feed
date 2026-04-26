const { sendMessage } = require("../src/telegram");
const {
  buildResponseScheduletoTelegram,
} = require("../helper/handleListenerMessage");
function toStr(x) {
  return String(x == null ? "" : x).trim();
}

const CHAT_SOCIAL_NOTIFY = process.env.CHAT_SOCIAL_NOTIFY || "";
const CHAT_SITES_NOTIFY = process.env.CHAT_SITES_NOTIFY || "";

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
  const _page = typeof page === "string" ? page.trim() : "";
  const _topic = (topic || "").trim();

  const header = status
    ? "🚀🚀🚀 Success Published 🔥🔥🔥"
    : "❌❌❌ Failed Published 🔥🔥🔥";

  const parts = [];
  parts.push(`<b>${header}</b>`);
  parts.push(`<b>${_title}</b>`);
  if (_topic && !status) parts.push(`Topic: ${_topic}`);
  if (_page) parts.push(`Page: ${_page}`);
  if (timeBangkok) parts.push(`<i>🕒 ${timeBangkok}</i>`);
  if (timeNewyork) parts.push(`<i>🕒 ${timeNewyork}</i>`);
  if (text) parts.push(text);

  return parts.join("\n");
}

function buildResponseSitesToTelegram({
  status,
  site,
  targets = [],
  title,
  text,
  topic,
  timeBangkok,
  timeNewyork,
} = {}) {
  const _title = (title || "New post").trim();
  const _site = (site || targets.join(" | ")).trim();
  const _topic = (topic || "").trim();

  const header =
    status === "success"
      ? "🚀🚀🚀 Success Published Site 🔥🔥🔥"
      : "❌❌❌ Failed Published Site 🔥🔥🔥";

  const parts = [];
  parts.push(`<b>${header}</b>`);
  parts.push(`<b>${_title}</b>`);
  if (_topic) parts.push(`Topic: ${_topic}`);
  if (_site) parts.push(`Website: ${_site}`);
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

    let message = "Not valid of message type!";
    if (body?.type === "post-social") {
      message = buildResponsePublishToTelegram(body);
    }
    if (body?.type === "schedule-social") {
      message = buildResponseScheduletoTelegram(body);
    }
    if (body?.type === "post-sites") {
      console.log("Body: ", body);
      message = buildResponseSitesToTelegram(body);
      console.log("Message: ", message);
      const response = await sendMessage(CHAT_SITES_NOTIFY, message);
      console.log("Response: ", response);
    }

    if (body?.type.includes("social")) {
      // gửi telegram
      if (chatId) {
        await sendMessage(chatId, message);
      }

      if (!body.status && CHAT_SOCIAL_NOTIFY) {
        await sendMessage(CHAT_SOCIAL_NOTIFY, message);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e?.message || e);

    return res.status(200).json({ ok: true });
  }
};
