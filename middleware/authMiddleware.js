const jwt = require("jsonwebtoken");

/**
 * Extracts userId from Bearer token.
 * Returns null if missing or invalid — callers decide whether to 401.
 */
const getUserId = (req) => {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    return jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET).id;
  } catch {
    return null;
  }
};

module.exports = { getUserId };
