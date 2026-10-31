const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      district TEXT NOT NULL,
      thana TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, district, thana)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rents (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      district TEXT NOT NULL,
      thana TEXT NOT NULL DEFAULT '',
      flat_type TEXT NOT NULL,
      rent INTEGER NOT NULL CHECK (rent BETWEEN 1000 AND 500000),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

app.use(express.json());
app.use(express.static("public"));

// সব জেলা/থানার গড় রেটিং
app.get("/api/ratings", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT district, thana, AVG(score)::float AS rating, COUNT(*)::int AS count
      FROM ratings
      GROUP BY district, thana
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "সার্ভার সমস্যা" });
  }
});

// রেটিং জমা (একই ইউজার আবার দিলে আগেরটা বদলাবে)
app.post("/api/rate", async (req, res) => {
  const { userId, district, thana, score } = req.body;
  if (typeof userId !== "string" || userId.length < 10 || userId.length > 100 ||
      typeof district !== "string" || !district ||
      !Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: "ভুল ডাটা" });
  }
  try {
    await pool.query(`
      INSERT INTO ratings (user_id, district, thana, score)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, district, thana)
      DO UPDATE SET score = EXCLUDED.score, created_at = NOW()
    `, [userId, district, thana || "", score]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "সার্ভার সমস্যা" });
  }
});

// ভাড়ার তথ্য জমা
const FLAT_TYPES = ["1K", "2K", "1LDK", "2LDK", "3K", "3LDK"];
app.post("/api/rent", async (req, res) => {
  const { userId, district, thana, flatType, rent } = req.body;
  if (typeof userId !== "string" || userId.length < 10 || userId.length > 100 ||
      typeof district !== "string" || !district ||
      !FLAT_TYPES.includes(flatType) ||
      !Number.isInteger(rent) || rent < 1000 || rent > 500000) {
    return res.status(400).json({ error: "ভুল ডাটা" });
  }
  try {
    await pool.query(`
      INSERT INTO rents (user_id, district, thana, flat_type, rent)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, district, thana || "", flatType, rent]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "সার্ভার সমস্যা" });
  }
});

// ভাড়ার পরিসর (মধ্যমা, সর্বনিম্ন, সর্বোচ্চ); অন্তত ৩টি তথ্য থাকলেই দেখানো হবে
app.get("/api/rents", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT district, thana, flat_type,
             COUNT(*)::int AS count,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rent)::int AS median,
             MIN(rent)::int AS min,
             MAX(rent)::int AS max
      FROM rents
      GROUP BY district, thana, flat_type
      HAVING COUNT(*) >= 3
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "সার্ভার সমস্যা" });
  }
});

init()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log("চলছে, পোর্ট: " + PORT));
  })
  .catch((err) => {
    console.error("ডাটাবেস সংযোগ ব্যর্থ:", err);
    process.exit(1);
  });