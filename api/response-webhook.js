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
    const text = toStr(body.text);
    const timeBangkok = toStr(body.timeBangkok);
    const timeNewyork = toStr(body.timeNewyork);

    if (!chatId || !text || !page) {
      throw new Error("Missing chatId, page or text");
    }

    const parts = [];
    parts.push(`<b>Published Notify 🔥🔥🔥</b>`);
    if (page) parts.push(`Page: ${page}`);
    if (timeBangkok) lines.push(`<i>🕒 ${timeBangkok}</i>`);
    if (timeNewyork) lines.push(`<i>🕒 ${timeNewyork}</i>`);
    if (text) parts.push(text);

    const message = parts.join("\n");

    // gửi telegram
    await sendMessage(chatId, message);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e?.message || e);

    // ⚠️ Telegram / webhook: luôn trả 200 để tránh retry spam
    return res.status(200).json({ ok: true });
  }
};
