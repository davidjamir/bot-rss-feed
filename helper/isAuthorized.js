function isAuthorized(req) {
  const REQUIRE_AUTH =
    String(process.env.REQUIRE_AUTH || "").toLowerCase() === "true";
  const CRON_SECRET = process.env.CRON_SECRET || "";

  if (!REQUIRE_AUTH) return true;
  if (!CRON_SECRET) return false;

  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token && token === CRON_SECRET;
}

module.exports = { isAuthorized };
