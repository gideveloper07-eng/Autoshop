const jwt = require("jsonwebtoken");

const decodeToken = (req) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return null;
    }

    const token = auth.split(" ")[1];

    // RETURN FULL DECODED TOKEN
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.log("TOKEN DECODE ERROR:", err.message);

    return null;
  }
};

module.exports = decodeToken;
