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

// POST /api/applications — submit application
router.post("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { college, course, message, userName } = req.body;
    if (!college || !course)
      return res.status(400).json({ message: "College and course are required" });

    const pool = await getPool();

    // Prevent duplicate
    const exists = await pool.request()
      .input("userId",  sql.Int,      userId)
      .input("college", sql.NVarChar, college)
      .input("course",  sql.NVarChar, course)
      .query("SELECT id FROM Applications WHERE userId=@userId AND college=@college AND course=@course");

    if (exists.recordset.length > 0)
      return res.status(400).json({ message: "You already applied to this college for this course" });

    const result = await pool.request()
      .input("userId",   sql.Int,      userId)
      .input("userName", sql.NVarChar, userName || "")
      .input("college",  sql.NVarChar, college)
      .input("course",   sql.NVarChar, course)
      .input("message",  sql.NVarChar, message  || "")
      .query(`
        INSERT INTO Applications (userId, userName, college, course, message)
        OUTPUT INSERTED.*
        VALUES (@userId, @userName, @college, @course, @message)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/applications — my applications
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const pool = await getPool();
    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query("SELECT * FROM Applications WHERE userId=@userId ORDER BY createdAt DESC");

    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/applications/count — dashboard count
router.get("/count", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const pool = await getPool();
    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query("SELECT COUNT(*) AS count FROM Applications WHERE userId=@userId");

    res.json({ count: result.recordset[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/applications/all — admin: all applications
router.get("/all", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Applications ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/applications/:id/status — admin: update status
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("id",     sql.Int,      req.params.id)
      .input("status", sql.NVarChar, status)
      .query(`
        UPDATE Applications
        SET status=@status, updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
