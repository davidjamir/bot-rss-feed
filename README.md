# Bot RSS Feed

Bot RSS chạy trên Vercel Functions, nhận lệnh từ Telegram, theo dõi RSS feed theo từng channel/group, rồi:
- gửi bài mới lên Telegram (`notify`)
- hoặc gửi Telegram + đẩy payload sang endpoint ngoài (`collect`)

Project dùng MongoDB để lưu cấu hình channel, hàng đợi jobs, trạng thái lock, và batches xử lý.

## Features

- Quản lý feed theo từng Telegram chat/channel bằng command bot
- Hỗ trợ 2 mode feed:
  - `notify`: chỉ gửi lên Telegram
  - `collect`: gửi Telegram + forward payload qua webhook API
- Kiến trúc queue theo shard để scale cron worker
- Lock feed theo thời gian để tránh xử lý trùng
- TTL index tự động cho `batches.createdAt` (hạn chế dữ liệu rác)
- Endpoint debug parser RSS với nhiều chiến lược fallback

## Tech Stack

- Node.js (Vercel Serverless Functions)
- MongoDB (`mongodb` driver)
- Telegram Bot API
- `rss-parser`

## Project Structure

```txt
api/
  telegram-webhook.js   # Telegram webhook receiver
  jobs-enqueue.js       # Build queue jobs từ danh sách channel/feed
  jobs-drain.js         # Drain queue theo shard và xử lý collectBatchJob
  jobs-queue.js         # Quan sát trạng thái queue theo shard
  publish-cron.js       # Xử lý batches pending (telegram/server)
  channel.js            # API đọc config channel
  response-webhook.js   # Nhận callback và gửi message Telegram
  debug-parser.js       # Debug parse RSS theo strategy

src/
  command.js            # Xử lý Telegram commands
  channel.js            # CRUD config channel + tags/flags/targets/session
  batch.js              # Enqueue + pop jobs queue
  job.js                # Parse RSS, build batch, cron process
  publish.js            # Trạng thái gửi telegram/server theo batch
  mongodb.js            # Kết nối DB + ensure TTL index
  telegram.js           # Wrapper Telegram API
  server.js             # Gửi payload collect sang endpoint ngoài
```

## Data Model (MongoDB)

- `channels`: cấu hình theo `chatId` (feeds, last, api, listen, topics, flags, tags, targets)
- `jobs`: queue item (`jobKey`, `shardId`, `createdAt`)
- `feeds`: lock theo `_id = jobKey` (`lockedUntil`, `lockedBy`)
- `batches`: payload chờ publish/forward + trạng thái retry
- `sessions`: lưu bind target cho user nhắn private bot

## Environment Variables

Tạo các biến sau trong Vercel Project:

- `MONGODB_URI`: MongoDB connection string
- `MONGODB_DB`: tên database (default trong code: `databases_bot`)
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `REQUIRE_AUTH`: `true|false` (bật/tắt auth cho cron/internal APIs)
- `CRON_SECRET`: bearer token dùng cho API có `isAuthorized`
- `SHARDS_NUMBER`: số shard queue jobs (default `10`)
- `BATCHES_TTL_SECONDS`: TTL cho `batches.createdAt` (default `43200` = 12h)

## API Endpoints

### `GET /api/jobs-enqueue`

Đọc toàn bộ channel + feed, tạo `jobKey = chatId|url`, enqueue vào `jobs`.

- Auth: cần `Authorization: Bearer <CRON_SECRET>` nếu `REQUIRE_AUTH=true`

### `GET /api/jobs-drain?shard=<n>&count=<m>`

Pop jobs theo shard, xử lý từng job qua `collectBatchJob`.

- Auth: như trên

### `GET /api/jobs-queue`

Xem trạng thái queue theo shard (len + peek).

- Auth: như trên

### `GET /api/publish-cron?limit=10`

Xử lý `batches` pending: gửi Telegram và/hoặc forward server endpoint.

- Auth: như trên

### `GET /api/channel`

Xem config channel:
- 1 channel: `?id=<chatId>` hoặc `?chatId=<chatId>`
- list: `?limit=10&offset=0`

### `POST /api/telegram-webhook`

Webhook nhận update từ Telegram, xử lý command bot và lifecycle chat member.

### `POST /api/response-webhook`

Nhận callback từ hệ thống ngoài rồi gửi kết quả ngược về Telegram.

### `GET /api/debug-parser?url=<feedUrl>&options=<0|1|2>`

Debug parser:
- `0`: parse RSS raw
- `1`: RSS2JSON service #1
- `2`: RSS2JSON service #2
- bỏ `options`: auto fallback lần lượt

## Telegram Commands (chính)

- Feed:
  - `/addfeed [notify|collect] <url>`
  - `/removefeed <url>`
  - `/listfeeds`
- API collect:
  - `/setapi <endpoint> [token]`
  - `/getapi`
  - `/unsetapi`
- Listener:
  - `/setlisten <endpoint> [token]`
  - `/getlisten`
  - `/unsetlisten`
- Metadata:
  - `/settopic`, `/listtopics`, `/removetopic`
  - `/setflag`, `/listflags`, `/removeflag`
  - `/addtag`, `/listtags`, `/removetag`
  - `/addtarget`, `/listtargets`, `/removetarget`
- Binding private chat:
  - `/bind @channel_or_id`
  - `/unbind`
- Khác:
  - `/help`, `/reset`

## Queue & Cron Flow

1. Cron gọi `jobs-enqueue` để nạp jobs từ tất cả feeds
2. Nhiều cron workers gọi `jobs-drain` theo từng shard
3. Mỗi job parse RSS, lấy item mới, lưu vào `batches`
4. Cron `publish-cron` xử lý `batches`:
   - gửi Telegram
   - nếu mode `collect` thì gửi thêm sang server endpoint

## TTL Index Strategy

Project dùng TTL index cho `batches.createdAt`:
- Index name chuẩn: `batches_createdAt_ttl`
- TTL lấy từ `BATCHES_TTL_SECONDS`
- Khi app cold-start:
  - nếu chưa có index -> tạo
  - nếu TTL khác -> tự reconcile bằng `collMod` (fallback `drop+create`)

Mục tiêu là tránh lỗi conflict kiểu:
`An equivalent index already exists ... same name but different options`.

## Deploy (Vercel)

1. Push code lên GitHub
2. Import repo vào Vercel
3. Set toàn bộ environment variables
4. Cấu hình Telegram webhook trỏ vào:
   - `https://<your-domain>/api/telegram-webhook`
5. Cấu hình cron jobs trên Vercel (hoặc scheduler ngoài) cho các route:
   - `/api/jobs-enqueue`
   - `/api/jobs-drain?shard=...&count=...`
   - `/api/publish-cron?limit=...`

## Notes

- Hiện `package.json` chưa có script chạy local/dev.
- Nên dùng token auth cho tất cả cron/internal endpoints ở production.
- Nếu đổi TTL batches, ưu tiên đổi qua `BATCHES_TTL_SECONDS` thay vì hardcode.