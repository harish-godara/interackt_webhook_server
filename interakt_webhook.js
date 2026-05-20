require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "10mb" }));

// ---------------- DB ----------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------------- HEALTH ----------------
app.get("/", (req, res) => {
  res.send("Interakt webhook running 🚀");
});

// ---------------- HELPERS ----------------
function getMessageId(body) {
  return body?.source_message_id || body?.data?.message?.id || null;
}

function getPhone(body) {
  return body?.data?.customer?.channel_phone_number || null;
}

function getTimestamp(body) {
  const msg = body?.data?.message || {};

  return (
    msg.seen_at_utc ||
    msg.delivered_at_utc ||
    msg.received_at_utc ||
    body?.timestamp ||
    new Date().toISOString()
  );
}

// ---------------- MAP EVENT → COLUMN ----------------
function getColumn(type) {
  switch (type) {
    case "message_api_sent":
      return "sent";

    case "message_api_delivered":
      return "delivered";

    case "message_api_read":
      return "read";

    case "message_received":
      return "reply";

    case "message_api_clicked":
      return "click";

    default:
      return null;
  }
}

// ---------------- WEBHOOK ----------------
app.post("/webhook/interakt", async (req, res) => {
  const body = req.body;

  res.sendStatus(200);

  try {
    console.log("\n📩 WEBHOOK RECEIVED:");
    console.log(JSON.stringify(body, null, 2));

    const type = body?.type;
    const message_id = getMessageId(body);
    const phone = getPhone(body);
    const timestamp = new Date(getTimestamp(body));

    const column = getColumn(type);

    console.log("\n📊 PARSED:");
    console.log({ type, message_id, phone, column, timestamp });

    if (!message_id || !column) {
      console.log("❌ Skipped (missing data or unsupported type)");
      return;
    }

    // ---------------- DYNAMIC COLUMN UPDATE ----------------
    const query = `
      INSERT INTO "Test".test_message_logs_interakt (message_id, phone, ${column})
      VALUES ($1, $2, $3)
      ON CONFLICT (message_id)
      DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, "Test".test_message_logs_interakt.phone),
        ${column} = EXCLUDED.${column}
    `;

    await pool.query(query, [message_id, phone, timestamp]);

    console.log(`✅ Updated ${column} for message ${message_id}`);

  } catch (err) {
    console.error("\n🔥 ERROR MESSAGE:");
    console.error(err.message);

    console.error("\n🔥 STACK:");
    console.error(err.stack);

    console.error("\n🔥 BODY:");
    console.log(JSON.stringify(body, null, 2));
  }
});

// ---------------- START ----------------
const PORT = process.env.PORT;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
