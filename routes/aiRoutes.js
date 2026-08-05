const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const aiController = require("../controllers/aiController");

router.post("/chat", verifyToken, aiController.chat);

module.exports = router;