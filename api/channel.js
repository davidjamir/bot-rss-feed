// api/channel.js
const { isAuthorized } = require("../helper/isAuthorized");
const { listChannelIds, getChannelConfig } = require("../src/channel");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const sp = url.searchParams;
  const id = sp.get("id");
  const chatId = sp.get("chatId");
  const rawLimit = sp.get("limit");
  const rawOffset = sp.get("offset");

  const oneId = String(id || chatId || "").trim();

  // ========== 1 channel ==========
  if (oneId) {
    const cfg = await getChannelConfig(oneId);

    return res.json({
      ok: true,
      channel: {
        chatId: oneId,
        feeds: cfg.feeds || [],
        last: cfg.last || {},
        api: {
          endpoint: cfg.api.endpoint,
          token: cfg.api.tokenMasked,
          updatedAt: cfg.api.updatedAt,
        },
        listen: {
          endpoint: cfg.listen.endpoint,
          token: cfg.listen.tokenMasked,
          updatedAt: cfg.listen.updatedAt,
        },
        topics: cfg.topics,
        flags: cfg.flags,
        targets: cfg.targets,
      },
    });
  }

  // ========== list ==========
  const limit = rawLimit == null ? 10 : Number(String(rawLimit).trim());
  const offset = rawOffset == null ? 0 : Number(String(rawOffset).trim());

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return res
      .status(400)
      .json({ ok: false, error: "limit must be an integer 1..50" });
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 200) {
    return res
      .status(400)
      .json({ ok: false, error: "limit must be an integer 0..200" });
  }

  let ids = await listChannelIds();
  ids = (ids || []).map(String);

  // stable ordering (set trong redis không đảm bảo thứ tự)
  ids.sort((a, b) => a.localeCompare(b, "en"));

  const page = ids.slice(offset, offset + limit);

  const items = await Promise.all(
    page.map(async (cid) => {
      const cfg = await getChannelConfig(cid);
      return {
        chatId: String(cid),
        feedsCount: (cfg.feeds || []).length,
        feeds: cfg.feeds || [],
        last: cfg.last || {},
        api: {
          endpoint: cfg.api.endpoint,
          token: cfg.api.tokenMasked,
          updatedAt: cfg.api.updatedAt,
        },
        listen: {
          endpoint: cfg.listen.endpoint,
          token: cfg.listen.tokenMasked,
          updatedAt: cfg.listen.updatedAt,
        },
        topics: cfg.topics,
        flags: cfg.flags,
        targets: cfg.targets,
      };
    })
  );

  return res.json({
    ok: true,
    total: ids.length,
    limit,
    offset,
    items,
  });
};
