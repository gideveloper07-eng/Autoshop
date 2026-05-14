const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const { getPool, sql } = require("../config/db");

const getUserId = (req) => {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try { return jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET).id; }
  catch { return null; }
};

// ── Colleges with search + filter ─────────────────────────────────────────
router.get("/colleges", async (req, res) => {
  try {
    const { q, type, city } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let where = "WHERE 1=1";
    if (q) {
      where += " AND name LIKE @q";
      request.input("q", sql.NVarChar, `%${q}%`);
    }
    if (type) {
      where += " AND type = @type";
      request.input("type", sql.NVarChar, type);
    }
    if (city) {
      where += " AND location LIKE @city";
      request.input("city", sql.NVarChar, `%${city}%`);
    }

    const result = await request.query(
      `SELECT * FROM Colleges ${where} ORDER BY createdAt DESC`
    );
    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Courses with search + filter ──────────────────────────────────────────
router.get("/courses", async (req, res) => {
  try {
    const { q, department } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let where = "WHERE 1=1";
    if (q) {
      where += " AND title LIKE @q";
      request.input("q", sql.NVarChar, `%${q}%`);
    }
    if (department) {
      where += " AND department LIKE @department";
      request.input("department", sql.NVarChar, `%${department}%`);
    }

    const result = await request.query(
      `SELECT * FROM AdminCourses ${where} ORDER BY createdAt DESC`
    );
    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notices ───────────────────────────────────────────────────────────────
router.get("/notices", async (_, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Notices ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications (notices + application status updates) ──────────────────
router.get("/notifications", async (req, res) => {
  try {
    const userId = getUserId(req);
    const pool   = await getPool();

    const noticesResult = await pool.request()
      .query("SELECT TOP 20 * FROM Notices ORDER BY createdAt DESC");

    const notifs = noticesResult.recordset.map(n => ({
      id:       n.id,
      type:     "notice",
      title:    n.title,
      body:     n.body,
      category: n.category,
      time:     n.createdAt,
    }));

    if (userId) {
      const appsResult = await pool.request()
        .input("userId", sql.Int, userId)
        .query(`
          SELECT TOP 10 * FROM Applications
          WHERE userId = @userId AND status != 'Under Review'
          ORDER BY updatedAt DESC
        `);

      for (const app of appsResult.recordset) {
        notifs.unshift({
          id:       app.id,
          type:     "application",
          title:    app.status === "Accepted" ? "🎉 Application Accepted!" : "❌ Application Update",
          body:     app.status === "Accepted"
            ? `Your application to ${app.college} for ${app.course} has been accepted.`
            : `Your application to ${app.college} for ${app.course} was rejected.`,
          category: app.status === "Accepted" ? "Accepted" : "Rejected",
          time:     app.updatedAt,
        });
      }
    }

    notifs.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json(notifs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
