const { getDb } = require("./mongodb"); // MongoDB client

const SHARDS_NUMBER = Math.max(1, Number(process.env.SHARDS_NUMBER || 10));
const QUEUE_MAXLEN = 200000;

function getShardId() {
  return Math.floor(Math.random() * SHARDS_NUMBER);
}

async function enqueueJobs(jobKeys = []) {
  const db = await getDb();
  const collection = db.collection("jobs");
  let enqueued = 0;
  const jobs = [];

  for (const k of jobKeys) {
    const jobKey = String(k || "").trim();
    if (!jobKey) continue;

    // Create a job object with shardId
    jobs.push({
      jobKey,
      shardId: getShardId(),
      createdAt: new Date(),
    });
    enqueued++;
  }

  // Insert all jobs into the database (batch insert)
  if (jobs.length) {
    await collection.insertMany(jobs);
  }

  return { ok: true, shards: SHARDS_NUMBER, enqueued };
}

// Fetch jobs based on the shardId and limit the results.
async function popJobs(shardId, count = 1) {
  const db = await getDb();
  const jobsColection = db.collection("jobs");
  const feedsColection = db.collection("feeds");

  const n = Math.max(1, Number(count) || 1);
  const out = [];

  const LOCK_MS = 3 * 60 * 1000;
  const now = new Date();

  while (out.length < n) {
    // 1️⃣ pop 1 job (FIFO + shard)
    const job = await jobsColection.findOneAndDelete(
      { shardId },
      { sort: { createdAt: 1 } },
    );

    if (!job || !job.jobKey) break;

    const jobKey = job.jobKey;

    // bước đảm bảo tồn tại (không check lock)
    await feedsColection.updateOne(
      { _id: jobKey },
      {
        $setOnInsert: {
          createdAt: now,
          lockedUntil: new Date(0),
        },
      },
      { upsert: true },
    );

    // bước lock (atomic)
    const r = await feedsColection.findOneAndUpdate(
      {
        _id: jobKey,
        lockedUntil: { $lte: now },
      },
      {
        $set: {
          lockedUntil: new Date(now.getTime() + LOCK_MS),
          lockedBy: `Worker_shard_${shardId}`,
          updatedAt: now,
        },
      },
    );

    if (!r) continue;

    out.push(jobKey);
  }

  return out;
}

module.exports = {
  SHARDS_NUMBER,
  QUEUE_MAXLEN,
  enqueueJobs,
  popJobs,
};
