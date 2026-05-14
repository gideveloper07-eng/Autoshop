const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { getPool, sql } = require("../config/db");

// ── Admin Login ───────────────────────────────────────────────────────────
const adminLogin = async (req, res) => {
  try {
    const { companyCode, userId, password } = req.body;
    const pool = await getPool();

    const result = await pool.request()
      .input("userId",      sql.NVarChar, userId)
      .input("companyCode", sql.NVarChar, companyCode)
      .query("SELECT * FROM Users WHERE userId = @userId AND companyCode = @companyCode AND role = 'admin'");

    const user = result.recordset[0];
    if (!user) return res.status(400).json({ message: "Invalid admin credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid admin credentials" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, name: user.name, userId: user.userId, companyCode: user.companyCode, role: "admin" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Seed Admin (run once) ─────────────────────────────────────────────────
const seedAdmin = async (req, res) => {
  try {
    const pool = await getPool();
    const exists = await pool.request()
      .query("SELECT id FROM Users WHERE role = 'admin'");

    if (exists.recordset.length > 0)
      return res.json({ message: "Admin already exists" });

    const hashed = await bcrypt.hash("admin123", 10);
    await pool.request()
      .input("name",        sql.NVarChar, "Admin")
      .input("email",       sql.NVarChar, "admin@college.com")
      .input("userId",      sql.NVarChar, "admin")
      .input("companyCode", sql.NVarChar, "ADMIN001")
      .input("password",    sql.NVarChar, hashed)
      .query(`
        INSERT INTO Users (name, email, userId, companyCode, password, role)
        VALUES (@name, @email, @userId, @companyCode, @password, 'admin')
      `);

    res.json({ message: "Admin created — companyCode: ADMIN001 / userId: admin / password: admin123" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── COLLEGES ──────────────────────────────────────────────────────────────
const getColleges = async (_, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Colleges ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const addCollege = async (req, res) => {
  try {
    const { name, location, type, rating, courses, description, image } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("name",        sql.NVarChar, name        || "")
      .input("location",    sql.NVarChar, location    || "")
      .input("type",        sql.NVarChar, type        || "Private")
      .input("rating",      sql.NVarChar, rating      || "4.0")
      .input("courses",     sql.NVarChar, courses     || "0")
      .input("description", sql.NVarChar, description || "")
      .input("image",       sql.NVarChar, image       || "")
      .query(`
        INSERT INTO Colleges (name, location, type, rating, courses, description, image)
        OUTPUT INSERTED.*
        VALUES (@name, @location, @type, @rating, @courses, @description, @image)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateCollege = async (req, res) => {
  try {
    const { name, location, type, rating, courses, description, image } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("id",          sql.Int,      req.params.id)
      .input("name",        sql.NVarChar, name        || "")
      .input("location",    sql.NVarChar, location    || "")
      .input("type",        sql.NVarChar, type        || "Private")
      .input("rating",      sql.NVarChar, rating      || "4.0")
      .input("courses",     sql.NVarChar, courses     || "0")
      .input("description", sql.NVarChar, description || "")
      .input("image",       sql.NVarChar, image       || "")
      .query(`
        UPDATE Colleges
        SET name=@name, location=@location, type=@type, rating=@rating,
            courses=@courses, description=@description, image=@image, updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (!result.recordset[0]) return res.status(404).json({ message: "College not found" });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteCollege = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Colleges WHERE id = @id");
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── COURSES ───────────────────────────────────────────────────────────────
const getCourses = async (_, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM AdminCourses ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const addCourse = async (req, res) => {
  try {
    const { title, department, duration, fees, seats, description, college } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("title",       sql.NVarChar, title       || "")
      .input("department",  sql.NVarChar, department  || "")
      .input("duration",    sql.NVarChar, duration    || "")
      .input("fees",        sql.NVarChar, fees        || "")
      .input("seats",       sql.Int,      seats       || 0)
      .input("description", sql.NVarChar, description || "")
      .input("college",     sql.NVarChar, college     || "")
      .query(`
        INSERT INTO AdminCourses (title, department, duration, fees, seats, description, college)
        OUTPUT INSERTED.*
        VALUES (@title, @department, @duration, @fees, @seats, @description, @college)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateCourse = async (req, res) => {
  try {
    const { title, department, duration, fees, seats, description, college } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("id",          sql.Int,      req.params.id)
      .input("title",       sql.NVarChar, title       || "")
      .input("department",  sql.NVarChar, department  || "")
      .input("duration",    sql.NVarChar, duration    || "")
      .input("fees",        sql.NVarChar, fees        || "")
      .input("seats",       sql.Int,      seats       || 0)
      .input("description", sql.NVarChar, description || "")
      .input("college",     sql.NVarChar, college     || "")
      .query(`
        UPDATE AdminCourses
        SET title=@title, department=@department, duration=@duration, fees=@fees,
            seats=@seats, description=@description, college=@college, updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (!result.recordset[0]) return res.status(404).json({ message: "Course not found" });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteCourse = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM AdminCourses WHERE id = @id");
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── NOTICES ───────────────────────────────────────────────────────────────
const getNotices = async (_, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query("SELECT * FROM Notices ORDER BY createdAt DESC");
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const addNotice = async (req, res) => {
  try {
    const { title, body, category } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("title",    sql.NVarChar, title    || "")
      .input("body",     sql.NVarChar, body     || "")
      .input("category", sql.NVarChar, category || "General")
      .query(`
        INSERT INTO Notices (title, body, category)
        OUTPUT INSERTED.*
        VALUES (@title, @body, @category)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateNotice = async (req, res) => {
  try {
    const { title, body, category } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input("id",       sql.Int,      req.params.id)
      .input("title",    sql.NVarChar, title    || "")
      .input("body",     sql.NVarChar, body     || "")
      .input("category", sql.NVarChar, category || "General")
      .query(`
        UPDATE Notices
        SET title=@title, body=@body, category=@category, updatedAt=GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    if (!result.recordset[0]) return res.status(404).json({ message: "Notice not found" });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteNotice = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Notices WHERE id = @id");
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = {
  adminLogin, seedAdmin,
  getColleges, addCollege, updateCollege, deleteCollege,
  getCourses,  addCourse,  updateCourse,  deleteCourse,
  getNotices,  addNotice,  updateNotice,  deleteNotice,
};
