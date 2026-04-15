const { handleCommand } = require("../src/command");
const {
  deleteChannel,
  getChannelConfig,
  saveChannelConfig,
} = require("../src/channel");

// đọc raw JSON cho chắc (Vercel env đôi khi req.body không auto-parse)
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function getFile(fileId) {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
  );
  const json = await res.json();
  return json.result;
}

function buildFileUrl(path) {
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "GET") {
    return res.status(200).send("OK"); // health check
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  try {
    const update = await readJson(req);

    // 1) Khi bot được add/kick/đổi quyền trong chat/channel
    // -> cập nhật index/config hoặc xoá
    const m = update.my_chat_member;
    if (m?.chat?.id) {
      const chatId = String(m.chat.id);
      const newStatus = m.new_chat_member?.status;

      if (newStatus === "kicked" || newStatus === "left") {
        await deleteChannel(chatId);
      } else {
        // đảm bảo key tồn tại (không làm mất feeds nếu đã có)
        const cfg = await getChannelConfig(chatId);
        await saveChannelConfig(chatId, cfg);
      }
    }

    // 2) Nhận message command để cấu hình
    if (update.message?.text) {
      await handleCommand(update.message);
    }

    // (tuỳ bạn) nhận command trong channel_post nếu admin post trong channel
    if (update.channel_post) {
      // channel_post có format giống message nhưng field name khác
      const msg = update.channel_post;

      const text = msg.caption || msg.text || "";

      let image_url = null;
      let video_url = null;

      // có ảnh thì mới xử lý
      try {
        // 🖼 ẢNH
        if (msg.photo?.length) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;

          const file = await getFile(fileId);
          image_url = buildFileUrl(file.file_path);
        }

        // 🎥 VIDEO
        else if (msg.video) {
          const fileId = msg.video.file_id;

          const file = await getFile(fileId);
          video_url = buildFileUrl(file.file_path);
        }
      } catch (err) {
        console.error("getFile error:", err);
      }

      await handleCommand({
        chat: msg.chat,
        from: msg.sender_chat || msg.from || { id: 0 },
        message_id: msg.message_id,
        media_group_id: msg.media_group_id || null,
        text,
        image_url,
        video_url,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error:", e);
    // Telegram chỉ cần 200 để không retry spam
    return res.status(200).json({ ok: true });
  }
};
