function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendServer(payload) {
  const { endpoint, token, tokenMasked, updatedAt } = payload?.api || {};
  if (!endpoint) return;

  payload.api = {
    endpoint,
    token: tokenMasked,
    updatedAt,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Publish webhook failed ${res.status}: ${t.slice(0, 300)}`);
  }
}
// Check xem có đủ điều kiện tạo bài viết không
function shouldCreatePost(item) {
  const link = (item.link || "").trim();
  const title = (item.title || "").trim();

  if (!link) return false;
  if (!title || title.length < 15) return false;

  return true;
}

function cleanSummary(summary = "") {
  return String(summary)
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function smartCutTitle(
  text,
  { minLength = 30, maxLength = 100, ellipsis = true } = {},
) {
  console.log("SMART CUT INPUT:", text.length);
  if (!text) return "";

  const s = text.replace(/\s+/g, " ").trim();
  console.log("NORMALIZED LENGTH:", s.length);
  if (s.length <= maxLength) {
    console.log("RETURN EARLY");
    return s;
  }

  console.log("CUTTING...");
  // 1️⃣ try sentence end within range
  const sentenceMatch = s.slice(minLength, maxLength + 1).match(/[.!?]/);
  if (sentenceMatch) {
    const cutAt = minLength + sentenceMatch.index + 1;
    return s.slice(0, cutAt).trim();
  }

  // 2️⃣ fallback: cut at nearest space before maxLength
  let cutAt = s.lastIndexOf(" ", maxLength);
  if (cutAt < minLength) {
    cutAt = maxLength;
  }

  return s.slice(0, cutAt).trim() + (ellipsis ? "…" : "");
}

function buildPublishItem(item) {
  return {
    title: smartCutTitle(item.title || ""),
    link: item.link || "",
    guid: item.guid || item.id || item.link || "",
    publishedAt: item.isoDate || item.pubDate || "",
    html: (item.contentEncoded || "").trim(), // full HTML
    snippet: (item.contentSnippet || cleanSummary(item.summary) || "").trim(),
  };
}

async function sendServerWithRetry(payload, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      await sendServer(payload);
      return;
    } catch (e) {
      lastErr = e;
      await sleep(500 + i * i * 1000); // 500ms, 1500ms, 3500ms
    }
  }
  throw lastErr;
}

module.exports = {
  sendServerWithRetry,
  shouldCreatePost,
  buildPublishItem,
};
