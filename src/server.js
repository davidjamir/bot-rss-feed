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

function buildPublishItem(item) {
  return {
    title: item.title || "",
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
