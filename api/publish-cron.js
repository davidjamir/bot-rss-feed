const { batchesCron } = require("../src/job");
const { isAuthorized } = require("../helper/isAuthorized.js");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const raw = url.searchParams.get("limit");
  const limit = raw == null ? 10 : Number(String(raw).trim());

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return res
      .status(400)
      .json({ ok: false, error: "limit must be an integer 1..50" });
  }

  try {
    const result = await batchesCron(limit);
    console.log(
      "Cron Job Cron Send to API EndPoint limit",
      JSON.stringify(result),
    );
    res.status(200).json(result);
  } catch (e) {
    console.error("[publish-cron] fatal", e);
    res.status(500).json({ ok: false });
  }
};
