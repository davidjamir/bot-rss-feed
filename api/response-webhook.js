const { sendMessage } = require("../src/telegram");

function toStr(x) {
  return String(x == null ? "" : x).trim();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};

    const chatId = toStr(body.chatId);
    const page = toStr(body.page);
    const title = toStr(body.title);
    const status = Boolean(body.status);
    const text = toStr(body.text);
    const timeBangkok = toStr(body.timeBangkok);
    const timeNewyork = toStr(body.timeNewyork);

    if (!chatId || !title || !page) {
      throw new Error("Missing chatId, page or title");
    }

    const header = status
      ? "🚀🚀🚀 Success New Post Published 🔥🔥🔥"
      : "❌❌❌ Failed Post Published 🔥🔥🔥";

    const parts = [];
    parts.push(`<b>${header}</b>`);
    parts.push(`<b>${title}</b>`);
    if (text) parts.push(text);
    if (page) parts.push(`Page: ${page}`);
    if (timeBangkok) parts.push(`<i>🕒 ${timeBangkok}</i>`);
    if (timeNewyork) parts.push(`<i>🕒 ${timeNewyork}</i>`);

    const message = parts.join("\n");

    // gửi telegram
    await sendMessage(chatId, message);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e?.message || e);

    return res.status(200).json({ ok: true });
  }
};
