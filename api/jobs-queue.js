const { isAuthorized } = require("../helper/isAuthorized");
const { SHARDS_NUMBER } = require("../src/batch");
const { getDb } = require("../src/mongodb"); // MongoDB client

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const db = await getDb(); // Database name
    const collection = db.collection("jobs");

    const queues = [];
    let total = 0;

    for (let i = 0; i < SHARDS_NUMBER; i++) {
      const shardKey = `shard_${i}`;
      const len = await collection.countDocuments({
        shardId: i, // Giới hạn tìm kiếm theo shardId
      });

      const peek = await collection
        .find({ shardId: i })
        .sort({ createdAt: 1 }) // Sắp xếp theo thời gian để lấy những payloads cũ nhất
        .limit(5)
        .toArray();

      queues.push({
        shard: i,
        shardKey,
        len,
        peek: peek.map((doc) => String(doc.jobKey)), // Chỉ lấy ID hoặc các thông tin cần thiết để hiển thị
      });

      total += len;
    }

    return res.json({
      ok: true,
      shards: SHARDS_NUMBER,
      total,
      queues,
    });
  } catch (e) {
    console.log("[jobs-queues] FAIL", String(e?.message || e));
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
