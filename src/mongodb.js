// src/mongodb.js
const { MongoClient } = require("mongodb");
const { attachDatabasePool } = require("@vercel/functions");

const options = {
  appName: "devrel.vercel.integration", // Tên ứng dụng của bạn
  maxIdleTimeMS: 5000, // Cấu hình thời gian tối đa kết nối idle
};

// Kết nối MongoDB với URI từ biến môi trường
const client = new MongoClient(process.env.MONGODB_URI, options);

// Attach MongoDB client vào database pool của Vercel
attachDatabasePool(client);

let _db;
let _initialized = false;

const BATCHES_TTL_INDEX_NAME = "batches_createdAt_ttl";
const BATCHES_TTL_SECONDS = Math.max(
  60,
  Number(process.env.BATCHES_TTL_SECONDS || 60 * 60 * 12),
);

async function getDb() {
  if (_db) return _db;

  // ⚠️ QUAN TRỌNG: attachDatabasePool KHÔNG tự connect
  if (!client.topology?.isConnected()) {
    await client.connect();
  }

  _db = client.db(process.env.MONGODB_DB || "databases_bot");

  if (!_initialized) {
    await ensureTTLIndex();
    _initialized = true;
  }
  return _db;
}

async function ensureTTLIndex() {
  const db = await getDb();
  const col = db.collection("batches");
  const indexes = await col.indexes();
  const ttlByCreatedAt = indexes.find(
    (idx) =>
      idx?.key &&
      Object.keys(idx.key).length === 1 &&
      idx.key.createdAt === 1 &&
      typeof idx.expireAfterSeconds === "number",
  );

  // First bootstrap: no TTL index on createdAt yet.
  if (!ttlByCreatedAt) {
    await col.createIndex(
      { createdAt: 1 },
      {
        name: BATCHES_TTL_INDEX_NAME,
        expireAfterSeconds: BATCHES_TTL_SECONDS,
      },
    );
    return;
  }

  // Keep index options up-to-date without failing cron on cold starts.
  const needTtlUpdate = ttlByCreatedAt.expireAfterSeconds !== BATCHES_TTL_SECONDS;
  if (needTtlUpdate) {
    try {
      await db.command({
        collMod: "batches",
        index: {
          keyPattern: { createdAt: 1 },
          expireAfterSeconds: BATCHES_TTL_SECONDS,
        },
      });
    } catch (e) {
      // Fallback for clusters where collMod is restricted.
      await col.dropIndex(ttlByCreatedAt.name);
      await col.createIndex(
        { createdAt: 1 },
        {
          name: BATCHES_TTL_INDEX_NAME,
          expireAfterSeconds: BATCHES_TTL_SECONDS,
        },
      );
      return;
    }
  }

  // One-time rename from legacy default name createdAt_1 to explicit name.
  if (ttlByCreatedAt.name !== BATCHES_TTL_INDEX_NAME) {
    await col.dropIndex(ttlByCreatedAt.name);
    await col.createIndex(
      { createdAt: 1 },
      {
        name: BATCHES_TTL_INDEX_NAME,
        expireAfterSeconds: BATCHES_TTL_SECONDS,
      },
    );
  }
}

// Export MongoClient cho các route hoặc file khác có thể sử dụng lại
module.exports = {
  getDb,
};
