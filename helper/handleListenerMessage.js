const { getChannelConfig } = require("../src/channel");
const { safeParse } = require("../helper/safeParse");
const { sendMessage } = require("../src/telegram");

function toStr(x) {
  return String(x == null ? "" : x).trim();
}

function buildResponsetoTelegram({
  skipped,
  page,
  title,
  link,
  timeBangkok,
  timeNewyork,
} = {}) {
  const _title = (title || "New post").trim();
  const _link = (link || "").trim();
  const _page = (page || "").trim();

  const lines = [];

  lines.push(`<b>Notify System 🔥🔥🔥</b>`);
  if (_page) lines.push(`Page: ${_page}`);
  lines.push(`<b>Schedule:</b>`);
  if (timeBangkok) lines.push(`<i>🕒 ${timeBangkok}</i>`);
  if (timeNewyork) lines.push(`<i>🕒 ${timeNewyork}</i>`);

  if (link) lines.push(`<a href="${_link}"><b>${_title}</b></a>`);
  else lines.push(`<b>${title}</b>`);

  if (skipped) {
    lines.push(`<b>Skipped</b>`);
    return lines.join("\n");
  }

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
  const endpoint = toStr(listen?.endpoint);
  const token = toStr(listen?.token);
  if (!endpoint) return null;

  const payload = {
    chatId: cid,
    text: t,
    flags,
  };

  const r = await postUpdateLinkToServer(endpoint, token, payload);

  if (r.status >= 300) return;
  const textResponse = buildResponsetoTelegram(r.json);

  return await sendMessage(r.json.chatId, textResponse);
}

module.exports = { handleListenerMessage };
