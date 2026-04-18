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
  topic,
  timeBangkok,
  timeNewyork,
} = {}) {
  const _title = (title || "New post").trim();
  const _page = (page || "").trim();
  const _topic = (topic || "").trim();

  const header = status
    ? "🔥🔥🔥 Schedule Notify 🔥🔥🔥"
    : "❌❌❌ Schedule Notify ❌❌❌";

  const lines = [];

  lines.push(`<b>${header}</b>`);
  lines.push(`<b>${_title}</b>`);
  if (_topic && !status) lines.push(`Topic: ${_topic}`);
  if (_page) lines.push(`Page: ${_page}`);
  if (timeBangkok) lines.push(`<i>🕒 ${timeBangkok}</i>`);
  if (timeNewyork) lines.push(`<i>🕒 ${timeNewyork}</i>`);
  if (text) {
    lines.push(`<b>Note: </b>${text}`);
    return lines.join("\n");
  }
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

function detectContentType({ images = [], videos = [], text }) {
  if (images.length && videos.length) return "mixed";
  if (videos.length) return "video";
  if (images.length) return "image";
  if (text) return "text";
  return "unknown";
}

async function handleListenerMessage({
  chatIdToReply,
  text,
  images = [],
  videos = [],
} = {}) {
  const cid = toStr(chatIdToReply);
  const t = toStr(text);
  if (!cid) throw new Error("handleListenerMessage: chatId is required");
  if (!t) return null;

  const cfg = (await getChannelConfig(cid)) || {};
  const listen = cfg?.listen;
  const flags = cfg?.flags || [];
  const tags = cfg?.tags || [];
  const topics = cfg?.topics || [];
  const endpoint = toStr(listen?.endpoint);
  const token = toStr(listen?.token);
  if (!endpoint) return null;

  const payload = {
    chatId: cid,
    flags,
    tags,
    topics,
    text: t,
    images,
    videos,
    contentType: detectContentType({ images, videos, text: t }),
  };

  console.log("Payload: ", payload);
  const r = await postUpdateLinkToServer(endpoint, token, payload);

  if (r.status >= 300) return;
  const textResponse = buildResponseScheduletoTelegram(r.json);

  return await sendMessage(r.json.chatId, textResponse);
}

const groups = {};

async function handleWithDelay({
  chatIdToReply,
  text,
  imageUrl,
  videoUrl,
  groupId,
}) {
  // ❗ không phải album → gửi luôn
  if (!groupId) {
    return handleListenerMessage({
      chatIdToReply,
      text,
      images: imageUrl ? [imageUrl] : [],
      videos: videoUrl ? [videoUrl] : [],
    });
  }

  // 🧩 album
  if (!groups[groupId]) {
    groups[groupId] = {
      chatIdToReply,
      text: "",
      images: [],
      videos: [],
      timeout: null,
      createdAt: Date.now(),
    };
  }

  const g = groups[groupId];

  if (imageUrl) g.images.push(imageUrl);
  if (videoUrl) g.videos.push(videoUrl);
  if (text) g.text = text;

  if (g.timeout) clearTimeout(g.timeout);

  g.timeout = setTimeout(async () => {
    try {
      const finalPayload = {
        chatIdToReply: g.chatIdToReply,
        text: g.text,
        images: [...new Set(g.images)], // 👈 dedupe luôn
        videos: [...new Set(g.videos)],
      };

      await handleListenerMessage(finalPayload);
    } catch (e) {
      console.error("group send error:", e);
    } finally {
      delete groups[groupId];
    }
  }, 1500); // ⏱ delay 1.5s (tuỳ chỉnh)
}

module.exports = {
  handleListenerMessage,
  handleWithDelay,
  buildResponseScheduletoTelegram,
};
