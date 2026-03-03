function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendServer(payload) {
  const { endpoint, token, updatedAt } = payload?.api || {};
  if (!endpoint) return;

  const safePayload = {
    ...payload,
    api: {
      endpoint,
      updatedAt,
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(safePayload),
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
  {
    cutWindowMin = 40,
    cutWindowMax = 250,
    triggerLength = 90,
    ellipsis = true,
  } = {},
) {
  if (!text) return "";

  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= triggerLength) {
    return s;
  }

  // 1️⃣ try sentence end within range
  const sentenceMatch = s.slice(cutWindowMin, cutWindowMax + 1).match(/[.!?]/);
  if (sentenceMatch) {
    const cutAt = cutWindowMin + sentenceMatch.index + 1;
    return s.slice(0, cutAt).trim();
  }

  // 2️⃣ fallback: cut at nearest space before cutWindowMax
  let cutAt = s.lastIndexOf(" ", cutWindowMax);
  if (cutAt < cutWindowMin) {
    cutAt = cutWindowMax;
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

async function sendServerWithRetry(payload, retries = 2) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      await sendServer(payload);
      return;
    } catch (e) {
      console.log("API: ", payload.api);
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
