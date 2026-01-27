function toStr(x) {
  return String(x ?? "").trim();
}

function esc(s = "") {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripHtml(s = "") {
  return s.replace(/<[^>]*>/g, " ");
}

// escape cho attribute trong HTML (href)
function escAttr(s = "") {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDateVN(input) {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  // "Jan 01 2026 16:40"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get(
    "minute",
  )} Asia/Ho_Chi_Minh`;
}

const ZWSP = "\u200B";

function breakUrl(u = "") {
  return u.replace("://", `:${ZWSP}//`).replace(/\./g, `.${ZWSP}`);
}

// Phá auto-link trong 1 đoạn text (mô tả)
function breakAutoLinks(text = "") {
  // 1) phá link có scheme: https://...
  let out = text.replace(/https?:\/\/[^\s]+/gi, (m) => breakUrl(m));

  // 2) phá domain dạng: quietly.it, abc.com/path
  // (chỉ bắt những cái có TLD >=2 chữ để tránh phá "a.b")
  out = out.replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi, (m) =>
    m.includes(ZWSP) ? m : m.replace(/\./g, `.${ZWSP}`),
  );

  return out;
}

function cutPointerPrefixAnywhere(snippet) {
  let s = toStr(snippet);
  if (!s) return "";

  s = s
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const start = s.indexOf("*]:pointer");
  if (start === -1) return s;

  const end = s.indexOf(">", start);
  if (end === -1) return s.slice(0, start).trim(); // or "" nếu muốn bỏ luôn

  return (s.slice(0, start) + " " + s.slice(end + 1))
    .replace(/\s+/g, " ")
    .trim();
}
const TG_LIMITS = {
  title: 400,
  desc: 600,
  link: 300,
  total: 4096,
};

function cutWithDots(s = "", max = 0) {
  s = toStr(s);
  if (!max || s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function formatItem(item, feedTitle = "", feedUrl = "") {
  const rawTitle = toStr(item.title || "New post");
  const title = esc(cutWithDots(rawTitle, TG_LIMITS.title));

  const link = (item.link || "").trim();
  const safeLink = link ? cutWithDots(link, TG_LIMITS.link) : "";

  const hasFull = item.html.trim().length > 500;

  const badge = hasFull ? "🔥🔥🔥🔥🔥 FULL 🔥🔥🔥🔥🔥" : "";

  const rawDesc = item.snippet || "";
  const cleanedDesc = breakAutoLinks(
    stripHtml(cutPointerPrefixAnywhere(rawDesc)),
  ).trim();
  const desc = esc(cutWithDots(cleanedDesc, TG_LIMITS.desc));

  const domain = link ? new URL(link).hostname.replace(/^www\./, "") : "";
  const when = formatDateVN(item.publishedAt);

  const lines = [];

  // Title as clickable link
  if (safeLink) lines.push(`<a href="${escAttr(link)}"><b>${title}</b></a>`);
  else lines.push(`<b>${title}</b>`);

  if (desc) lines.push(desc);

  if (safeLink) lines.push(`LINK: ${safeLink}`);
  if (when) lines.push(`<i>🕒 ${esc(when)}</i>`);
  // meta
  const meta = [
    feedTitle && esc(feedTitle),
    domain && esc(breakAutoLinks(domain)),
  ]
    .filter(Boolean)
    .join(" • ");
  if (meta) lines.push(`<i>${meta}</i>`);

  // last line: feed link
  if (feedUrl) lines.push(`<i>Feed: ${esc(breakAutoLinks(feedUrl))}</i>`);
  if (badge) lines.push(`<b>${badge}</b>`);

  let msg = lines.join("\n");

  if (msg.length > TG_LIMITS.total) {
    msg = cutWithDots(msg, TG_LIMITS.total - 10);
  }

  return msg;
}

module.exports = { formatItem };
