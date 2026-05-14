const jwt  = require("jsonwebtoken");
const { getPool, sql } = require("../config/db");

const adminAuth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "No token" });

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, decoded.id)
      .query("SELECT id, name, email, role FROM Users WHERE id = @id");

    const user = result.recordset[0];
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = adminAuth;
