const { getDb } = require("./mongodb"); // MongoDB client

async function saveBatch(payload, mode) {
  const db = await getDb();
  const col = db.collection("batches");

  await col.insertOne({
    payload, // nguyên gói
    mode, // notify | collect

    telegram: {
      sent: false,
      failCount: 0,
      sentLinks: [],
      lastError: null,
      sentAt: null,
    },

    server: {
      sent: false,
      failCount: 0,
      lastError: null,
      sentAt: null,
    },

    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function getBatches(limit = 10, maxRetry = 5) {
  const db = await getDb();
  const col = db.collection("batches");

  const query = {
    $or: [
      // chưa gửi telegram
      { "telegram.sent": false, "telegram.failCount": { $lt: maxRetry } },

      // collect: telegram ok, server chưa ok
      {
        mode: "collect",
        "telegram.sent": true,
        "server.sent": false,
      },
    ],
  };

  const batches = await col
    .find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  return batches;
}

async function onTelegramSuccess(batch) {
  const db = await getDb();
  const col = db.collection("batches");

  // mode notify: dùng xong là bỏ
  if (batch.mode === "notify") {
    await col.deleteOne({ _id: batch._id });
    return;
  }

  // mode collect: đánh dấu đã gửi telegram
  await col.updateOne(
    { _id: batch._id },
    {
      $set: {
        "telegram.sent": true,
        "telegram.sentAt": new Date(),
        "telegram.lastError": null,
        updatedAt: new Date(),
      },
    },
  );
}

async function onTelegramFail(batch, err, successLinks = []) {
  const db = await getDb();
  const col = db.collection("batches");

  const errorMsg =
    err?.message || (typeof err === "string" ? err : JSON.stringify(err));
  await col.updateOne(
    { _id: batch._id },
    {
      $inc: { "telegram.failCount": 1 },
      $set: {
        "telegram.lastError": errorMsg,
        updatedAt: new Date(),
        "telegram.sentLinks": successLinks,
      },
    },
  );

  console.error("[telegram] send failed", batch._id.toString(), errorMsg);
}

async function onServerSuccess(batch) {
  const db = await getDb();
  const col = db.collection("batches");

  // server ok là xong đời batch
  await col.deleteOne({ _id: batch._id });
}

async function onServerFail(batch, err) {
  const db = await getDb();
  const col = db.collection("batches");

  const errorMsg =
    err?.message || (typeof err === "string" ? err : JSON.stringify(err));
  await col.updateOne(
    { _id: batch._id },
    {
      $inc: { "server.failCount": 1 },
      $set: { "server.lastError": errorMsg, updatedAt: new Date() },
    },
  );

  console.error("[telegram] send failed", batch._id.toString(), errorMsg);
}

module.exports = {
  saveBatch,
  getBatches,
  onTelegramSuccess,
  onTelegramFail,
  onServerSuccess,
  onServerFail,
};
