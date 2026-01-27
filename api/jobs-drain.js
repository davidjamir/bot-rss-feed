const { isAuthorized } = require("../helper/isAuthorized");
const { popJobs } = require("../src/batch");
const { collectBatchJob } = require("../src/job");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const urlObj = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`,
    );

    // mặc định 5 nếu không truyền
    const shard = Number(urlObj.searchParams.get("shard") || 0);
    const count = Number(urlObj.searchParams.get("count") || 5);

    console.log("Cloudflare Cron Job For Jobs Drain by Queue ", shard);

    const jobKeys = await popJobs(shard, count);
    console.log("Jobs", jobKeys);

    let okCount = 0;
    let skipped = 0;
    let failed = 0;

    for (const jobKey of jobKeys) {
      try {
        const r = await collectBatchJob(jobKey);
        if (r?.skipped) skipped++;
        else if (r?.ok) okCount++;
        else failed++;
      } catch (e) {
        failed++;
        console.log("[jobs-drain] job fail", jobKey, String(e?.message || e));
      }
    }

    return res.json({
      ok: true,
      shard,
      popped: jobKeys.length,
      okCount,
      skipped,
      failed,
    });
  } catch (e) {
    console.log("[jobs-drain] FAIL", String(e?.message || e));
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
