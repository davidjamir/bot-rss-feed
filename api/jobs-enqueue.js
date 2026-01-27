const { isAuthorized } = require("../helper/isAuthorized");
const { listChannelIds, getChannelConfig } = require("../src/channel");
const { enqueueJobs } = require("../src/batch");

function toStr(x) {
  return String(x ?? "").trim();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    console.log("Cloudflare Cron Job For Jobs Enqueue");

    const chatIds = await listChannelIds();
    const jobKeys = [];

    let totalFeeds = 0;

    for (const chatId of chatIds) {
      const cfg = await getChannelConfig(chatId);
      const feeds = Array.isArray(cfg.feeds) ? cfg.feeds : [];

      for (const f of feeds) {
        const url = toStr(f?.url);
        if (!url) continue;
        jobKeys.push(`${String(chatId)}|${url}`);
        totalFeeds++;
      }
    }

    const r = await enqueueJobs(jobKeys);

    return res.json({
      ok: true,
      totalChats: chatIds.length,
      totalFeeds,
      enqueued: r.enqueued,
      shards: r.shards,
    });
  } catch (e) {
    console.log("[jobs-enqueue] FAIL", String(e?.message || e));
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
