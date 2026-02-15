// src/rssJob.js
const Parser = require("rss-parser");
const { getChannelConfig, saveChannelConfig } = require("./channel");
const {
  sendServerWithRetry,
  shouldCreatePost,
  buildPublishItem,
} = require("./server");
const { sendTelegram } = require("./telegram");
const {
  saveBatch,
  getBatches,
  onTelegramSuccess,
  onTelegramFail,
  onServerSuccess,
  onServerFail,
} = require("./publish");

const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

const MAX_RETRY = 5;
const RSS2JSON_1 = "https://api.rss2json.com/v1/api.json?rss_url=";
const RSS2JSON_2 = "https://www.toptal.com/developers/feed2json/convert?url=";

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function parseFeed(url) {
  let res;
  try {
    res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        redirect: "follow",
      },
      15000, // ⏱ timeout thật
    );
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("FETCH_TIMEOUT");
    }
    throw e;
  }

  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }

  const xml = await res.text();
  return parser.parseString(xml);
}

function convertJsonFeedToRSSLike(data) {
  return {
    title: data.title || data.feed.title,
    items: (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      guid: item.guid,
      categories: item.categories || [],
      pubDate: item.pubDate || item.date_published,
      summary: item.summary,
      contentSnippet: item.description,
      contentEncoded: item.content_html || item.content,
    })),
  };
}

async function parseRSS2JSON(serviceUrl, feedUrl) {
  const fullUrl = serviceUrl + encodeURIComponent(feedUrl);

  const res = await fetchWithTimeout(fullUrl, {}, 15000);

  if (!res.ok) {
    throw new Error(`RSS2JSON_HTTP_${res.status}`);
  }

  const data = await res.json();

  if (!data?.items) {
    throw new Error("RSS2JSON_INVALID");
  }

  return convertJsonFeedToRSSLike(data);
}

async function parseFeedSmart(url, options) {
  const strategies = [
    async () => {
      console.log("Try RAW RSS...");
      return await parseFeed(url);
    },
    async () => {
      console.log("Try RSS2JSON #1...");
      return await parseRSS2JSON(RSS2JSON_1, url);
    },
    async () => {
      console.log("Try RSS2JSON #2...");
      return await parseRSS2JSON(RSS2JSON_2, url);
    },
  ];

  // ===== Nếu có option -> chạy đúng 1 strategy =====
  if (options !== undefined) {
    if (!strategies[options]) {
      throw new Error("INVALID_OPTION");
    }

    return await strategies[options]();
  }

  // ===== Nếu không có option -> auto fallback =====
  let lastError;

  for (let i = 0; i < strategies.length; i++) {
    try {
      return await strategies[i]();
    } catch (err) {
      console.log(`Strategy ${i} failed:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("ALL_STRATEGIES_FAILED");
}

function toStr(x) {
  return String(x ?? "").trim();
}

function parseJobKey(jobKey) {
  const s = String(jobKey || "");
  const i = s.indexOf("|");
  if (i < 0) return null;
  const chatId = s.slice(0, i).trim();
  const url = s.slice(i + 1).trim();
  if (!chatId || !url) return null;
  return { chatId, url };
}

function normalizeUrl(u) {
  let s = String(u || "").trim();
  s = s.replace(/[\r\n\t ]+/g, "");

  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s ? encodeURI(s) : "";
}

/**
 * Trả về list item mới dựa trên lastLink.
 * - Nếu lastLink tồn tại và tìm thấy trong list => items trước nó là mới.
 * - Nếu lastLink không tìm thấy (feed đổi link / reorder) => fallback: chỉ lấy top N (ví dụ 1-3)
 */
function getNewItems(items, lastLink, fallbackTake = 1) {
  if (!items?.length) return [];

  if (!lastLink) {
    // lần đầu: tránh spam, chỉ lấy 1
    return items.slice(0, fallbackTake);
  }

  const idx = items.findIndex((it) => it.link === lastLink);
  if (idx === -1) {
    // Không thấy lastLink: feed có thể đổi link hoặc reorder
    // để an toàn không spam, chỉ lấy 1
    return items.slice(0, fallbackTake);
  }

  // items[0..idx-1] là mới
  return items.slice(0, idx);
}

// ====== MAIN: handle 1 jobKey (chatId|url) ======
async function collectBatchJob(jobKey = "") {
  const parsed = parseJobKey(jobKey);
  if (!parsed) return { ok: false, error: "invalid jobKey", jobKey };

  const chatId = toStr(parsed.chatId);
  const feedUrl = normalizeUrl(parsed.url);
  if (!feedUrl) return { ok: false, error: "invalid feedUrl", chatId, jobKey };

  const cfg = await getChannelConfig(chatId);

  // check feed còn tồn tại
  const feedCfg = (cfg.feeds || []).find(
    (f) => normalizeUrl(f?.url) === feedUrl,
  );
  if (!feedCfg) {
    return { ok: true, skipped: true, reason: "feed removed", chatId, feedUrl };
  }

  const mode =
    toStr(feedCfg?.mode).toLowerCase() === "collect" ? "collect" : "notify";

  const last = cfg.last || {};
  const api = cfg.api || {};
  const topics = cfg.topics || [];
  const flags = cfg.flags || [];
  const tags = cfg.tags || [];
  const targets = cfg.targets || [];

  let feed;
  try {
    feed = await parseFeedSmart(feedUrl);
  } catch (e) {
    return {
      ok: false,
      error: e.message || "parse_failed",
      feedUrl,
    };
  }

  const items = feed.items || [];
  const lastLink = last[feedUrl] || "";
  const newItems = getNewItems(items, lastLink, 1);
  if (!newItems.length)
    return { ok: true, skipped: true, reason: "no new item" };

  const publishItems = [];

  for (const item of [...newItems].reverse()) {
    if (shouldCreatePost(item)) {
      publishItems.push(buildPublishItem(item));
    }
  }

  if (!publishItems.length) return { ok: true, skipped: true };

  const payload = {
    chatId: String(chatId),
    api: {
      endpoint: api.endpoint,
      token: api.token,
      tokenMasked: api.tokenMasked,
      updatedAt: api.updatedAt,
    },
    topics,
    flags,
    tags,
    targets,
    source: {
      feedUrl,
      feedTitle: feed.title || "",
      mode,
    },
    items: publishItems,
    createdAt: new Date().toISOString(),
  };

  try {
    // 1️⃣ update boundary trước
    if (newItems[0]?.link) {
      last[feedUrl] = newItems[0].link;
      cfg.last = last;
      await saveChannelConfig(chatId, cfg);
    }

    // 2️⃣ sau đó mới save batch
    await saveBatch(payload, mode);
  } catch (e) {
    console.error("Collect batch failed:", e);
    return { ok: false, error: e.message };
  }

  return {
    ok: true,
    chatId,
    feedUrl,
    mode,
    batches: 1,
    items: publishItems.length,
  };
}

async function batchesCron(limit = 10) {
  const batches = await getBatches(limit, MAX_RETRY);

  const stats = {
    processed: batches.length,
    telegram: { sent: 0, failed: 0 },
    server: { sent: 0, failed: 0 },
  };

  for (const batch of batches) {
    // ===== TELEGRAM =====
    if (!batch.telegram?.sent && batch.telegram.failCount <= MAX_RETRY) {
      const sentLinks = batch.telegram?.sentLinks || [];

      const filteredItems = batch.payload.items.filter(
        (item) => !sentLinks.includes(item.link),
      );

      if (!filteredItems.length) {
        // Tất cả đã gửi xong
        await onTelegramSuccess(batch);
        stats.telegram.sent++;
        continue;
      }

      const newPayload = {
        ...batch.payload,
        items: filteredItems,
      };

      try {
        await sendTelegram(newPayload);
        await onTelegramSuccess(batch);
        stats.telegram.sent++;
      } catch (e) {
        await onTelegramFail(batch, e.error, [...sentLinks, ...e.successLinks]);
        stats.telegram.failed++;
        continue;
      }
    }

    // ===== SERVER =====
    if (
      batch.mode === "collect" &&
      batch.telegram?.sent &&
      !batch.server?.sent &&
      batch.server.failCount <= MAX_RETRY
    ) {
      try {
        await sendServerWithRetry(batch.payload, MAX_RETRY);
        await onServerSuccess(batch); // delete
        stats.server.sent++;
      } catch (e) {
        await onServerFail(batch, e);
        stats.server.failed++;
      }
    }
  }
  return {
    ok: true,
    ...stats,
  };
}

module.exports = {
  collectBatchJob,
  batchesCron,
  parseFeedSmart,
};
