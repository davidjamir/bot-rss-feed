const { getChannelConfig } = require("../src/channel");
const { safeParse } = require("../helper/safeParse");
const { sendMessage } = require("../src/telegram");

function toStr(x) {
  return String(x == null ? "" : x).trim();
}

function buildResponseScheduletoTelegram({
  status,
  skipped,
  page,
  title,
  text,
  timeBangkok,
  timeNewyork,
} = {}) {
  const _title = (title || "New post").trim();
  const _page = (page || "").trim();

  const header = status
    ? "🔥🔥🔥 Schedule Notify 🔥🔥🔥"
    : "❌❌❌ Schedule Notify ❌❌❌";

  const lines = [];

  lines.push(`<b>${header}</b>`);
  lines.push(`<b>${_title}</b>`);
  if (text) {
    lines.push(`<b>Note: </b>${text}`);
    return lines.join("\n");
  }
  if (timeBangkok) lines.push(`<i>🕒 ${timeBangkok}</i>`);
  if (timeNewyork) lines.push(`<i>🕒 ${timeNewyork}</i>`);
  if (_page) lines.push(`Page: ${_page}`);
  if (skipped) lines.push(`<b>Skipped</b>`);

  return lines.join("\n");
}

async function postUpdateLinkToServer(endpoint, token, payload) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text().catch(() => "");
  return { ok: r.ok, status: r.status, json: safeParse(text), text };
}

async function handleListenerMessage(chatId, text) {
  const cid = toStr(chatId);
  const t = toStr(text);
  if (!cid) throw new Error("handleListenerMessage: chatId is required");
  if (!t) return null;

  const cfg = (await getChannelConfig(cid)) || {};
  const listen = cfg?.listen;
  const flags = cfg?.flags;
  const tags = cfg?.tags;
  const endpoint = toStr(listen?.endpoint);
  const token = toStr(listen?.token);
  if (!endpoint) return null;

  const payload = {
    chatId: cid,
    flags,
    tags,
    text: t,
  };

  const r = await postUpdateLinkToServer(endpoint, token, payload);

  if (r.status >= 300) return;
  const textResponse = buildResponseScheduletoTelegram(r.json);

  return await sendMessage(r.json.chatId, textResponse);
}

module.exports = { handleListenerMessage, buildResponseScheduletoTelegram };
