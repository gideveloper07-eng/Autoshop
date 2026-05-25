const jwt = require("jsonwebtoken");

// ─────────────────────────────────────
// VERIFY TOKEN MIDDLEWARE
// ─────────────────────────────────────

const verifyToken = (req, res, next) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = auth.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // VERY IMPORTANT
    req.user = decoded;

    next();
  } catch (err) {
    console.log("TOKEN VERIFY ERROR:", err.message);

    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

// ─────────────────────────────────────
// OPTIONAL TOKEN DECODER
// ─────────────────────────────────────

const decodeToken = (req) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return null;
    }

    const token = auth.split(" ")[1];

    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.log("TOKEN DECODE ERROR:", err.message);

    return null;
  }
};

module.exports = {
  verifyToken,
  decodeToken,
};
