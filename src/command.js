const {
  addFeed,
  removeFeed,
  getChannelConfig,
  deleteChannel,
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
  getTargets,
  removeTarget,
  addTag,
  getTags,
  removeTag,
} = require("./channel");
const {
  sendMessage,
  getChat,
  getUserMember,
  isAdminLike,
} = require("./telegram");
const { handleListenerMessage } = require("../helper/handleListenerMessage");

function normalizeUrl(u) {
  let s = String(u || "").trim();
  s = s.replace(/[\r\n\t]+/g, "");

  s = s.replace(/\s+/g, "");
  return s ? encodeURI(s) : "";
}

function normalizeToken(t) {
  return String(t || "")
    .trim()
    .replace(/[\r\n\t]+/g, "");
}

function fmtFeeds(cfg) {
  const feeds = cfg.feeds || [];
  if (!feeds.length) return "Không có feed nào.";
  return feeds
    .map((f, i) => {
      const url = (f?.url || "").trim();
      const mode = f?.mode === "collect" ? "collect" : "notify";
      const tag = mode === "collect" ? "🧲 collect" : "🔔 notify";
      return `#${i + 1}) ${tag}  ${url}`;
    })
    .join("\n");
}

function parseTagList(arg) {
  return String(arg || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtTagList(title, arr) {
  const xs = Array.isArray(arr) ? arr : [];
  if (!xs.length) return `${title}: <b>(not set)</b>`;
  return [
    `${title}`,
    ...xs.map((x, index) => `#${index + 1}) • <code>${x}</code>`),
  ].join("\n");
}

// xác định “targetChatId” cho command
async function resolveTargetChatId(message) {
  const chat = message.chat;
  const from = message.from;

  // nếu command gõ trong group/supergroup/channel => target = chat hiện tại
  if (chat.type !== "private") return String(chat.id);

  // nếu DM => lấy binding session
  const bound = await getBoundTarget(from.id);
  return bound; // có thể null
}

async function handleCommand(message) {
  const text = (message.text || "").trim();
  const chatIdToReply = String(message.chat.id);
  const userId = message.from?.id;

  if (!text.startsWith("/")) return handleListenerMessage(chatIdToReply, text);

  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0]; // /addfeed@botname => /addfeed
  const arg = rest.join(" ").trim();

  // HELP
  if (cmd === "/help" || cmd === "/start") {
    return sendMessage(
      chatIdToReply,
      [
        "<b>RSS Bot — Commands</b>",
        "",
        "<b>Where to use</b>",
        "• <b>Group/Supergroup/Channel</b>: commands apply to that chat.",
        "• <b>Private chat</b>: use <b>/bind</b> to select a target chat first.",
        "",
        "<b>Target binding (private chat only)</b>",
        "• <b>/bind</b> @channel_username | -100xxxx   — set target chat",
        "• <b>/unbind</b>   — clear target chat",
        "",
        "<b>API Settings (for collect mode)</b>",
        "In <b>collect</b> mode, the bot will POST items to the only configured API endpoint and include a token for authorization.",
        "• <b>/setapi</b> endpoint token   — set API endpoint and optional token for this chat",
        "   - <b>api_endpoint</b>: e.g. <b>https://publish.example.com</b>",
        "   - <b>token</b>: [option] used as <b>Authorization: Bearer token</b>",
        "• <b>/getapi</b>   — show current API endpoint (token masked)",
        "• <b>/unsetapi</b>   — clear API settings",
        "",
        "<b>Listener</b>",
        "Configure a listener for this chat/channel (endpoint + token).",
        "• <b>/setlisten</b> endpoint token   — set/update listener endpoint and token",
        "• <b>/getlisten</b>   — show current listener configuration",
        "• <b>/unsetlisten</b>   — remove/disable listener for this chat/channel",
        "",
        "<b>Feeds</b>",
        "• <b>/addfeed</b> [notify|collect] [url]   — add/update a feed",
        "   - <b>notify</b>: send Telegram notifications only (default)",
        "   - <b>collect</b>: notify + collect content for external processing",
        "• <b>/removefeed</b> [url]   — remove a feed",
        "• <b>/listfeeds</b>   — list current feeds",
        "",
        "<b>Topics</b>",
        "Set topics for this chat/channel to categorize content.",
        "• <b>/settopic</b> topic1 topic2   — set topics (space or comma separated)",
        "• <b>/listtopics</b>   — show current topics",
        "• <b>/removetopic</b> topic   — remove one topic",
        "",
        "<b>Flags</b>",
        "Set flags for this chat/channel to control workflow.",
        "• <b>/setflag</b> flag1 flag2   — set flags (space or comma separated)",
        "• <b>/listflags</b>   — show current flags",
        "• <b>/removeflag</b> flag   — remove one flag",
        "",
        "<b>Tags</b>",
        "Set tag keys for this chat/channel (stored as an array).",
        "• <b>/addtag</b> key1 key2   — add one or many (space/comma separated)",
        "• <b>/listtags</b>   — show current tags",
        "• <b>/removetag</b> key   — remove one tag",
        "",
        "<b>Targets</b>",
        "Set target keys for this chat/channel (stored as an array).",
        "• <b>/addtarget</b> key1 key2   — add one or many (space/comma separated)",
        "• <b>/listtargets</b>   — show current targets",
        "• <b>/removetarget</b> key   — remove one target",
        "",
        "<b>Maintenance</b>",
        "• <b>/reset</b>   — reset configuration for this chat",
        "",
        "<b><i>Examples</i></b>",
        "<b>/addfeed https://example.com/rss</b>",
        "<b>/addfeed collect https://example.com/rss</b>",
        "<b>/setapi https://publish.example.com [option - token]</b>",
        "<b>/settopic technology ai</b> or <b>/settopic technology,ai</b>",
        "<b>/setflag starred manual</b>",
      ].join("\n"),
    );
  }

  // UNBIND (DM only)
  if (cmd === "/unbind") {
    if (message.chat.type !== "private") {
      return sendMessage(chatIdToReply, "Only apply in private chat.");
    }
    await clearBoundTarget(userId);
    return sendMessage(chatIdToReply, "OK, unbind successful.");
  }

  // BIND (DM only): /bind @xxx hoặc /bind -100xxx
  if (cmd === "/bind") {
    if (message.chat.type !== "private") {
      return sendMessage(chatIdToReply, "Only apply in private chat.");
    }
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/bind @channel</code> or <code>/bind -100xxxx</code>",
      );
    }

    // resolve chat by username/id
    let targetChat;
    try {
      targetChat = await getChat(arg);
    } catch (e) {
      return sendMessage(chatIdToReply, `Not found chat/channel: ${arg}`);
    }

    const targetId = String(targetChat.id);

    // check user có phải admin của target không (để tránh người lạ bind bậy)
    try {
      const mem = await getUserMember(targetId, userId);
      if (!isAdminLike(mem)) {
        return sendMessage(
          chatIdToReply,
          "You are not admin/creator of channel/group, bind failed.",
        );
      }
    } catch (e) {
      // Nếu bot chưa có quyền getChatMember ở channel đó, bind vẫn ok nhưng cảnh báo
      // (thực tế: bot thường phải được add vào channel để check member; tuỳ channel settings)
    }

    await setBoundTarget(userId, targetId);
    return sendMessage(
      chatIdToReply,
      `OK, bind target successful: <b>${
        targetChat.title || targetChat.username || targetId
      }</b>\nYou can use /addfeed /listfeeds...`,
    );
  }

  // resolve target
  const targetChatId = await resolveTargetChatId(message);
  if (!targetChatId) {
    return sendMessage(
      chatIdToReply,
      "Private Chat. Require <b>/bind @channel</b> before.",
    );
  }

  // SETAPI: /setapi <endpoint> [token]
  if (cmd === "/setapi") {
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <b>/setapi https://example.com/api/endpoint token</b>\nOr <b>/setapi https://example.com/api/endpoint</b> (token optional).",
      );
    }

    const parts = arg.split(/\s+/).filter(Boolean);
    const endpoint = normalizeUrl(parts[0] || "");
    const token = normalizeToken(parts[1] || ""); // optional

    if (!endpoint) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/setapi https://example.com/api/endpoint token (token optional).",
      );
    }

    try {
      const r = await setApi(targetChatId, endpoint, token);
      return sendMessage(
        chatIdToReply,
        [
          "<b>API settings saved</b>",
          `• Endpoint: <b>${r.endpoint || endpoint}</b>`,
          `• Token: <b>${r.tokenMasked || "***"}</b>`,
        ].join("\n"),
      );
    } catch (e) {
      return sendMessage(
        chatIdToReply,
        `Failed to set API: <b>${String(e?.message || e)}</b>`,
      );
    }
  }

  // GETAPI
  if (cmd === "/getapi") {
    const api = await getApi(targetChatId);

    if (!api?.endpoint) {
      return sendMessage(
        chatIdToReply,
        [
          "<b>API settings</b>",
          "• Endpoint: <b>(not set)</b>",
          "• Token: <b>(not set)</b>",
          "",
          "Set it with:",
          "<b>/setapi https://example.com/api/endpoint 123</b>",
        ].join("\n"),
      );
    }

    return sendMessage(
      chatIdToReply,
      [
        "<b>API settings</b>",
        `• Endpoint: <b>${api.endpoint}</b>`,
        `• Token: <b>${api.tokenMasked || "***"}</b>`,
        api.updatedAt ? `• Updated: <b>${api.updatedAt}</b>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  // UNSETAPI
  if (cmd === "/unsetapi") {
    await unsetApi(targetChatId);
    return sendMessage(
      chatIdToReply,
      [
        "<b>API settings cleared</b>",
        "Collect mode will no longer POST to an API endpoint.",
      ].join("\n"),
    );
  }

  // SETLISTEN: /setlisten <endpoint> [token]
  if (cmd === "/setlisten") {
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <b>/setlisten https://example.com/api/endpoint token</b>\nOr <b>/setlisten https://example.com/api/endpoint</b> (token optional).",
      );
    }

    const parts = arg.split(/\s+/).filter(Boolean);
    const endpoint = normalizeUrl(parts[0] || "");
    const token = normalizeToken(parts[1] || ""); // optional

    if (!endpoint) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/setlisten https://example.com/api/endpoint token (token optional).",
      );
    }

    try {
      const r = await setListen(targetChatId, endpoint, token);
      return sendMessage(
        chatIdToReply,
        [
          "<b>Listen settings saved</b>",
          `• Endpoint: <b>${r.endpoint || endpoint}</b>`,
          `• Token: <b>${r.tokenMasked || "***"}</b>`,
        ].join("\n"),
      );
    } catch (e) {
      return sendMessage(
        chatIdToReply,
        `Failed to set Listen: <b>${String(e?.message || e)}</b>`,
      );
    }
  }
  // GETLISTEN
  if (cmd === "/getlisten") {
    const listen = await getListen(targetChatId);

    if (!listen?.endpoint) {
      return sendMessage(
        chatIdToReply,
        [
          "<b>Listen settings</b>",
          "• Endpoint: <b>(not set)</b>",
          "• Token: <b>(not set)</b>",
          "",
          "Set it with:",
          "<b>/setlisten https://example.com/api/endpoint 123</b>",
        ].join("\n"),
      );
    }

    return sendMessage(
      chatIdToReply,
      [
        "<b>Listen settings</b>",
        `• Endpoint: <b>${listen.endpoint}</b>`,
        `• Token: <b>${listen.tokenMasked || "***"}</b>`,
        listen.updatedAt ? `• Updated: <b>${listen.updatedAt}</b>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  // UNSETLISTEN
  if (cmd === "/unsetlisten") {
    await unsetListen(targetChatId);
    return sendMessage(
      chatIdToReply,
      [
        "<b>Listen settings cleared</b>",
        "Collect mode will no longer POST to an Listen endpoint.",
      ].join("\n"),
    );
  }

  // ADDFEED
  if (cmd === "/addfeed") {
    if (!arg)
      return sendMessage(
        chatIdToReply,
        "Use <code>/addfeed [notify|collect] https://site/rss</code>",
      );

    const parts = arg.trim().split(/\s+/).filter(Boolean);
    let mode = "notify";
    let urlRaw = "";

    const p0 = (parts[0] || "").toLowerCase();

    if (p0 === "collect" || p0 === "notify") {
      mode = p0;
      urlRaw = parts[1] || ""; // chỉ lấy 1 token URL
    } else {
      urlRaw = parts[0] || ""; // cũng chỉ lấy 1 token
    }

    const url = normalizeUrl(urlRaw);

    if (!url)
      return sendMessage(
        chatIdToReply,
        "Use <code>/addfeed [notify|collect] https://site/rss</code>",
      );
    await addFeed(targetChatId, url, mode);
    const cfg = await getChannelConfig(targetChatId);
    return sendMessage(
      chatIdToReply,
      `Added feed (${mode}).\n\n<b>Feeds:</b>\n${fmtFeeds(cfg)}`,
    );
  }

  // REMOVEFEED
  if (cmd === "/removefeed") {
    const url = normalizeUrl(arg);
    if (!url)
      return sendMessage(
        chatIdToReply,
        "Use <code>/removefeed https://site/rss</code>",
      );
    await removeFeed(targetChatId, url);
    const cfg = await getChannelConfig(targetChatId);
    return sendMessage(
      chatIdToReply,
      `Removed feed.\n\n<b>Feeds:</b>\n${fmtFeeds(cfg)}`,
    );
  }

  // LISTFEEDS
  if (cmd === "/listfeeds") {
    const cfg = await getChannelConfig(targetChatId);
    return sendMessage(chatIdToReply, `<b>Feeds:</b>\n${fmtFeeds(cfg)}`);
  }

  // SETTOPIC: /settopic technology ai
  if (cmd === "/settopic") {
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/settopic technology ai</code> or <code>/settopic technology,ai</code>",
      );
    }
    const topics = parseTagList(arg);
    await setTopics(targetChatId, topics);
    const current = await getTopics(targetChatId);
    return sendMessage(
      chatIdToReply,
      ["<b>Topics updated</b>", fmtTagList("Topics", current)].join("\n"),
    );
  }

  // GETTOPIC
  if (cmd === "/listtopics") {
    const current = await getTopics(targetChatId);
    return sendMessage(chatIdToReply, fmtTagList("Topics", current));
  }

  // REMOVETOPIC: /removetopic technology
  if (cmd === "/removetopic") {
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/removetopic technology</code>",
      );
    }
    await removeTopic(targetChatId, arg);
    const current = await getTopics(targetChatId);
    return sendMessage(
      chatIdToReply,
      ["<b>Topic removed</b>", fmtTagList("Topics", current)].join("\n"),
    );
  }

  // SETFLAG: /setflag starred manual
  if (cmd === "/setflag") {
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/setflag starred manual</code> or <code>/setflag starred,manual</code>",
      );
    }
    const flags = parseTagList(arg);
    await setFlags(targetChatId, flags);
    const current = await getFlags(targetChatId);
    return sendMessage(
      chatIdToReply,
      ["<b>Flags updated</b>", fmtTagList("Flags", current)].join("\n"),
    );
  }

  // GETFLAG
  if (cmd === "/listflags") {
    const current = await getFlags(targetChatId);
    return sendMessage(chatIdToReply, fmtTagList("Flags", current));
  }

  // REMOVEFLAG: /removeflag starred
  if (cmd === "/removeflag") {
    if (!arg) {
      return sendMessage(chatIdToReply, "Use <code>/removeflag starred</code>");
    }
    await removeFlag(targetChatId, arg);
    const current = await getFlags(targetChatId);
    return sendMessage(
      chatIdToReply,
      ["<b>Flag removed</b>", fmtTagList("Flags", current)].join("\n"),
    );
  }

  // ADDTARGET: /addtarget a b c  | /addtarget a,b,c
  if (cmd === "/addtarget") {
    if (!arg) {
      return sendMessage(
        chatIdToReply,
        "Use <code>/addtarget key1 key2</code> or <code>/addtarget key1,key2</code>",
      );
    }

    const targets = parseTagList(arg); // reuse parseTagList
    await addTarget(targetChatId, targets);

    const current = await getTargets(targetChatId);
    return sendMessage(
      chatIdToReply,
      ["<b>Targets updated</b>", fmtTagList("Targets", current)].join("\n"),
    );
  }

  // LISTTARGETS
  if (cmd === "/listtargets") {
    const current = await getTargets(targetChatId);
    return sendMessage(chatIdToReply, fmtTagList("Targets", current));
  }

  // REMOVETARGET: remove 1
  if (cmd === "/removetarget") {
    if (!arg) {
      return sendMessage(chatIdToReply, "Use <code>/removetarget key</code>");
    }

    await removeTarget(targetChatId, arg);
    const current = await getTargets(targetChatId);

    return sendMessage(
      chatIdToReply,
      ["<b>Target removed</b>", fmtTagList("Targets", current)].join("\n"),
    );
  }

  // ADDTAG:  /addtarget a,b,c
  if (cmd === "/addtag") {
    if (!arg) {
      return sendMessage(chatIdToReply, "Use <code>/addtag key1,key2</code>");
    }

    const tags = parseTagList(arg); // reuse parseTagList
    await addTag(targetChatId, tags);

    const current = await getTags(targetChatId);
    return sendMessage(
      chatIdToReply,
      ["<b>Tags updated</b>", fmtTagList("Tags", current)].join("\n"),
    );
  }

  // LISTTAGS
  if (cmd === "/listtags") {
    const current = await getTags(targetChatId);
    return sendMessage(chatIdToReply, fmtTagList("Tags", current));
  }

  // REMOVETAG: remove 1
  if (cmd === "/removetag") {
    if (!arg) {
      return sendMessage(chatIdToReply, "Use <code>/removetag key</code>");
    }

    await removeTag(targetChatId, arg);
    const current = await getTags(targetChatId);

    return sendMessage(
      chatIdToReply,
      ["<b>Target removed</b>", fmtTagList("Tags", current)].join("\n"),
    );
  }

  // RESET
  if (cmd === "/reset") {
    await deleteChannel(targetChatId);
    return sendMessage(chatIdToReply, "Reset config successful.");
  }

  return sendMessage(chatIdToReply, "Need /help for details.");
}

module.exports = { handleCommand };
