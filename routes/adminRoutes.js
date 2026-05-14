const express   = require("express");
const router    = express.Router();
const adminAuth = require("../middleware/adminAuth");
const { getPool, sql } = require("../config/db");
const {
  adminLogin, seedAdmin,
  getColleges, addCollege, updateCollege, deleteCollege,
  getCourses,  addCourse,  updateCourse,  deleteCourse,
  getNotices,  addNotice,  updateNotice,  deleteNotice,
} = require("../controllers/adminController");

// ── Public ────────────────────────────────────────────────────────────────
router.post("/login", adminLogin);
router.get ("/seed",  seedAdmin);

// ── Colleges ──────────────────────────────────────────────────────────────
router.get   ("/colleges",     adminAuth, getColleges);
router.post  ("/colleges",     adminAuth, addCollege);
router.put   ("/colleges/:id", adminAuth, updateCollege);
router.delete("/colleges/:id", adminAuth, deleteCollege);

// ── Courses ───────────────────────────────────────────────────────────────
router.get   ("/courses",     adminAuth, getCourses);
router.post  ("/courses",     adminAuth, addCourse);
router.put   ("/courses/:id", adminAuth, updateCourse);
router.delete("/courses/:id", adminAuth, deleteCourse);

// ── Notices ───────────────────────────────────────────────────────────────
router.get   ("/notices",     adminAuth, getNotices);
router.post  ("/notices",     adminAuth, addNotice);
router.put   ("/notices/:id", adminAuth, updateNotice);
router.delete("/notices/:id", adminAuth, deleteNotice);

// ── Applications (admin view + status update) ─────────────────────────────
router.get("/applications", adminAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Applications ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/applications/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Under Review", "Accepted", "Rejected"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

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

    if (!result.recordset[0])
      return res.status(404).json({ message: "Application not found" });

    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
