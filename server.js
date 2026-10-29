const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const db = new Database("neer.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    district TEXT NOT NULL,
    thana TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, district, thana)
  )
`);

app.use(express.json());
app.use(express.static("public"));

// সব জেলা/থানার গড় রেটিং
app.get("/api/ratings", (req, res) => {
  const rows = db.prepare(`
    SELECT district, thana, AVG(score) AS rating, COUNT(*) AS count
    FROM ratings
    GROUP BY district, thana
  `).all();
  res.json(rows);
});

// রেটিং জমা (একই ইউজার আবার দিলে আগেরটা বদলে যাবে)
app.post("/api/rate", (req, res) => {
  const { userId, district, thana, score } = req.body;
  if (typeof userId !== "string" || userId.length < 10 || userId.length > 100 ||
      typeof district !== "string" || !district ||
      !Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: "ভুল ডাটা" });
  }
  db.prepare(`
    INSERT INTO ratings (user_id, district, thana, score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, district, thana)
    DO UPDATE SET score = excluded.score, created_at = CURRENT_TIMESTAMP
  `).run(userId, district, thana || "", score);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("চলছে, পোর্ট: " + PORT));