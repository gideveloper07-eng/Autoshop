const jwt = require("jsonwebtoken");

// ─────────────────────────────────────
// VERIFY TOKEN MIDDLEWARE
// ─────────────────────────────────────

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      userName: decoded.userName,

      // Permanent identity
      loginDatabase: decoded.loginDatabase,
      loginPropertyCode: decoded.loginPropertyCode,
      loginPropertyName: decoded.loginPropertyName,
      loginClientId: decoded.loginClientId,

      // Current working dealership
      currentDatabase: decoded.currentDatabase,
      currentPropertyCode: decoded.currentPropertyCode,
      currentPropertyName: decoded.currentPropertyName,
      currentClientId: decoded.currentClientId,

      // Backward compatibility
      database:
        decoded.currentDatabase || decoded.loginDatabase || decoded.database,

      propertyCode:
        decoded.currentPropertyCode ||
        decoded.loginPropertyCode ||
        decoded.propertyCode,

      propertyName:
        decoded.currentPropertyName ||
        decoded.loginPropertyName ||
        decoded.propertyName,

      clientId:
        decoded.currentClientId || decoded.loginClientId || decoded.clientId,

      userGuid: decoded.userGuid,
      utg: decoded.utg,
      isAdmin: decoded.isAdmin || false,
    };

    next();
  } catch (err) {
    console.error("TOKEN VERIFY ERROR:", err.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// ─────────────────────────────────────
// OPTIONAL TOKEN DECODER
// ─────────────────────────────────────

const decodeToken = (req) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return {
      userId: decoded.userId,
      userName: decoded.userName,

      // Permanent identity
      loginDatabase: decoded.loginDatabase,
      loginPropertyCode: decoded.loginPropertyCode,
      loginPropertyName: decoded.loginPropertyName,
      loginClientId: decoded.loginClientId,

      // Current working dealership
      currentDatabase: decoded.currentDatabase,
      currentPropertyCode: decoded.currentPropertyCode,
      currentPropertyName: decoded.currentPropertyName,
      currentClientId: decoded.currentClientId,

      // Backward compatibility
      database:
        decoded.currentDatabase || decoded.loginDatabase || decoded.database,

      propertyCode:
        decoded.currentPropertyCode ||
        decoded.loginPropertyCode ||
        decoded.propertyCode,

      propertyName:
        decoded.currentPropertyName ||
        decoded.loginPropertyName ||
        decoded.propertyName,

      clientId:
        decoded.currentClientId || decoded.loginClientId || decoded.clientId,

      userGuid: decoded.userGuid,
      utg: decoded.utg,
      isAdmin: decoded.isAdmin || false,
    };
  } catch (err) {
    console.error("TOKEN DECODE ERROR:", err.message);
    return null;
  }
};

const verifyAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access only",
      });
    }

    next();
  } catch (err) {
    console.error("ADMIN VERIFY ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Authorization error",
    });
  }
};

module.exports = {
  verifyToken,
  decodeToken,
  verifyAdmin,
};
