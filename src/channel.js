// src/channelsStore.js
const { getDb } = require("./mongodb"); // MongoDB client
const channelCollectionName = "channels"; // Collection chứa thông tin kênh
const sessionCollectionName = "sessions"; // Collection lưu session người dùng

function toStr(x) {
  return String(x == null ? "" : x).trim();
}

function normEndpoint(x) {
  let s = toStr(x);
  if (!s) return "";

  // allow "example.com/api/ingest" -> "https://example.com/api/ingest"
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  // remove trailing spaces and trailing slashes
  s = s.replace(/\s+/g, "").replace(/\/+$/, "");
  return s;
}

function maskToken(t) {
  const s = toStr(t);
  if (!s) return "";
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

function normTagorFlag(x) {
  // keep it simple: lowercase, trim, remove spaces
  // if you want stricter: replace non [a-z0-9_-] with "-"
  let s = toStr(x); // đã trim
  if (!s) return "";
  s = s.replace(/^,+|,+$/g, "");
  return s;
}

function normalizeList(input) {
  const arr = Array.isArray(input) ? input : [];
  const set = new Set(arr.map(normTagorFlag).filter(Boolean));
  return Array.from(set);
}

async function getChannelConfig(chatId) {
  const db = await getDb();
  const collection = db.collection(channelCollectionName);
  const config = await collection.findOne({ chatId });

  if (!config) {
    return {
      feeds: [],
      last: {},
      api: {},
      listen: {},
      topics: [],
      flags: [],
      targets: [],
    };
  }

  return config;
}

// Lưu thông tin channel vào MongoDB
async function saveChannelConfig(chatId, config) {
  const db = await getDb();
  const collection = db.collection(channelCollectionName);

  const safe = {
    feeds: Array.isArray(config.feeds) ? config.feeds : [],
    last: config.last && typeof config.last === "object" ? config.last : {},
    api: config.api && typeof config.api === "object" ? config.api : {},
    listen:
      config.listen && typeof config.listen === "object" ? config.listen : {},
    topics: Array.isArray(config.topics) ? normalizeList(config.topics) : [],
    flags: Array.isArray(config.flags) ? normalizeList(config.flags) : [],
    targets: Array.isArray(config.targets) ? normalizeList(config.targets) : [],
  };

  // Cập nhật hoặc thêm mới channel config
  await collection.updateOne({ chatId }, { $set: safe }, { upsert: true });
}

// Lấy tất cả các channelId (danh sách các chatId)
async function listChannelIds() {
  const db = await getDb();
  const collection = db.collection(channelCollectionName);
  const channels = await collection
    .find({}, { projection: { chatId: 1 } })
    .toArray();
  return channels.map((channel) => channel.chatId);
}

// Xóa channel khỏi MongoDB
async function deleteChannel(chatId) {
  const db = await getDb();
  const collection = db.collection(channelCollectionName);
  await collection.deleteOne({ chatId });
}

async function addFeed(chatId, feedUrl, mode = "notify") {
  const cfg = await getChannelConfig(chatId);
  const url = String(feedUrl || "").trim();
  if (!url) return cfg;

  const idx = (cfg.feeds || []).findIndex((f) => f.url === url);
  if (idx === -1) cfg.feeds.push({ url, mode });
  else cfg.feeds[idx].mode = mode; // nếu đã có thì update mode

  await saveChannelConfig(chatId, cfg);
  return cfg;
}

async function removeFeed(chatId, feedUrl) {
  const cfg = await getChannelConfig(chatId);
  const url = String(feedUrl || "").trim();

  cfg.feeds = (cfg.feeds || []).filter((f) => f.url !== url);
  delete cfg.last?.[url];
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

// src/sessionsStore.js
async function setBoundTarget(userId, targetChatId) {
  const collection = db.collection(sessionCollectionName);

  await collection.updateOne(
    { userId: String(userId) },
    { $set: { targetChatId: String(targetChatId) } },
    { upsert: true },
  );
  // TTL cho session để tránh rác
  await collection.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 7 * 24 * 60 * 60 },
  ); // Session expires after 1 week
}

async function getBoundTarget(userId) {
  const collection = db.collection(sessionCollectionName);

  const session = await collection.findOne({ userId: String(userId) });
  return session ? session.targetChatId : null;
}

async function clearBoundTarget(userId) {
  const collection = db.collection(sessionCollectionName);
  await collection.deleteOne({ userId: String(userId) });
}

// ===== API =====
async function setApi(chatId, endpoint, token) {
  const cfg = await getChannelConfig(chatId);

  const ep = normEndpoint(endpoint);
  if (!ep) throw new Error("ENDPOINT is required");
  const newToken = toStr(token) || "default_token";

  cfg.api = {
    endpoint: ep,
    token: newToken,
    tokenMasked: maskToken(newToken),
    updatedAt: new Date().toISOString(),
  };

  await saveChannelConfig(chatId, cfg);
  return {
    endpoint: cfg.api.endpoint,
    tokenMasked: cfg.api.tokenMasked,
    updatedAt: cfg.api.updatedAt,
  };
}

async function getApi(chatId) {
  const cfg = await getChannelConfig(chatId);
  const api = cfg.api && typeof cfg.api === "object" ? cfg.api : {};
  return {
    endpoint: toStr(api.endpoint),
    token: toStr(api.token),
    tokenMasked: toStr(api.tokenMasked),
    updatedAt: toStr(api.updatedAt),
  };
}

async function unsetApi(chatId) {
  const cfg = await getChannelConfig(chatId);
  delete cfg.api;
  await saveChannelConfig(chatId, cfg);
  return { ok: true };
}

// ===== LISTENER =====
async function setListen(chatId, endpoint, token) {
  const cfg = await getChannelConfig(chatId);

  const ep = normEndpoint(endpoint);
  if (!ep) throw new Error("ENDPOINT is required");
  const newToken = toStr(token) || "default_token";

  cfg.listen = {
    endpoint: ep,
    token: newToken,
    tokenMasked: maskToken(newToken),
    updatedAt: new Date().toISOString(),
  };

  await saveChannelConfig(chatId, cfg);
  return {
    endpoint: cfg.listen.endpoint,
    tokenMasked: cfg.listen.tokenMasked,
    updatedAt: cfg.listen.updatedAt,
  };
}

async function getListen(chatId) {
  const cfg = await getChannelConfig(chatId);
  const listen = cfg.listen && typeof cfg.listen === "object" ? cfg.listen : {};
  return {
    endpoint: toStr(listen.endpoint),
    token: toStr(listen.token),
    tokenMasked: toStr(listen.tokenMasked),
    updatedAt: toStr(listen.updatedAt),
  };
}

async function unsetListen(chatId) {
  const cfg = await getChannelConfig(chatId);
  delete cfg.listen;
  await saveChannelConfig(chatId, cfg);
  return { ok: true };
}

// ===== TOPICS =====
async function setTopics(chatId, topics) {
  const cfg = await getChannelConfig(chatId);
  cfg.topics = normalizeList(topics);
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

async function getTopics(chatId) {
  const cfg = await getChannelConfig(chatId);
  return cfg.topics;
}

async function removeTopic(chatId, topic) {
  const cfg = await getChannelConfig(chatId);
  cfg.topics = normalizeList((cfg.topics || []).filter((x) => x !== topic));
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

// ===== FLAGS =====
async function setFlags(chatId, flags) {
  const cfg = await getChannelConfig(chatId);
  cfg.flags = normalizeList(flags);
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

async function getFlags(chatId) {
  const cfg = await getChannelConfig(chatId);
  return cfg.flags;
}

async function removeFlag(chatId, flag) {
  const cfg = await getChannelConfig(chatId);
  cfg.flags = normalizeList((cfg.flags || []).filter((x) => x !== flag));
  await saveChannelConfig(chatId, cfg);
  return cfg;
}

async function addTarget(chatId, targets = []) {
  const cfg = await getChannelConfig(chatId);

  const keys = normalizeList(targets);
  if (!keys.length) return cfg;

  cfg.targets = normalizeList([...(cfg.targets || []), ...keys]);

  await saveChannelConfig(chatId, cfg);
  return cfg;
}

async function listTargets(chatId) {
  const cfg = await getChannelConfig(chatId);
  return Array.isArray(cfg.targets) ? cfg.targets : [];
}

async function removeTarget(chatId, target) {
  const cfg = await getChannelConfig(chatId);

  const t = normTagorFlag(target);
  if (!t) return cfg;

  cfg.targets = normalizeList((cfg.targets || []).filter((x) => x !== t));

  await saveChannelConfig(chatId, cfg);
  return cfg;
}

module.exports = {
  getChannelConfig,
  saveChannelConfig,
  listChannelIds,
  deleteChannel,
  addFeed,
  removeFeed,
  setBoundTarget,
  getBoundTarget,
  clearBoundTarget,
  setApi,
  getApi,
  unsetApi,
  setListen,
  getListen,
  unsetListen,
  setTopics,
  getTopics,
  removeTopic,
  setFlags,
  getFlags,
  removeFlag,
  addTarget,
  listTargets,
  removeTarget,
};
