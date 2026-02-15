const { parseFeedSmart } = require("../src/job");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const feedUrl = String(url.searchParams.get("url") || "").trim(); // ?url=
    const options = url.searchParams.get("options") || -1;
    if (!feedUrl) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing ?url=<feedUrl>" });
    }

    const feed =
      options === -1
        ? await parseFeedSmart(feedUrl)
        : await parseFeedSmart(feedUrl, options);

    console.log("Parser RSS URL", { options, ...feedUrl });
    return res.status(200).json({
      ok: true,
      feedUrl,
      feed,
    });
  } catch (e) {
    console.error("debug-parser error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
    });
  }
};
