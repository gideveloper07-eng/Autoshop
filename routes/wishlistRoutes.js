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

// GET /api/wishlist — my wishlist
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const pool = await getPool();
    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query("SELECT * FROM Wishlists WHERE userId=@userId ORDER BY createdAt DESC");

    res.json(result.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/wishlist — add to wishlist
router.post("/", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { collegeId, collegeName, location, type, rating } = req.body;
    const pool = await getPool();

    const exists = await pool.request()
      .input("userId",    sql.Int,      userId)
      .input("collegeId", sql.NVarChar, collegeId)
      .query("SELECT id FROM Wishlists WHERE userId=@userId AND collegeId=@collegeId");

    if (exists.recordset.length > 0)
      return res.status(400).json({ message: "Already in wishlist" });

    const result = await pool.request()
      .input("userId",     sql.Int,      userId)
      .input("collegeId",  sql.NVarChar, collegeId   || "")
      .input("collegeName",sql.NVarChar, collegeName || "")
      .input("location",   sql.NVarChar, location    || "")
      .input("type",       sql.NVarChar, type        || "")
      .input("rating",     sql.NVarChar, rating      || "")
      .query(`
        INSERT INTO Wishlists (userId, collegeId, collegeName, location, type, rating)
        OUTPUT INSERTED.*
        VALUES (@userId, @collegeId, @collegeName, @location, @type, @rating)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/wishlist/:collegeId — remove from wishlist
router.delete("/:collegeId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const pool = await getPool();
    await pool.request()
      .input("userId",    sql.Int,      userId)
      .input("collegeId", sql.NVarChar, req.params.collegeId)
      .query("DELETE FROM Wishlists WHERE userId=@userId AND collegeId=@collegeId");

    res.json({ message: "Removed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/wishlist/check/:collegeId — check if saved
router.get("/check/:collegeId", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ saved: false });

    const pool = await getPool();
    const exists = await pool.request()
      .input("userId",    sql.Int,      userId)
      .input("collegeId", sql.NVarChar, req.params.collegeId)
      .query("SELECT id FROM Wishlists WHERE userId=@userId AND collegeId=@collegeId");

    res.json({ saved: exists.recordset.length > 0 });
  } catch (e) { res.json({ saved: false }); }
});

module.exports = router;
