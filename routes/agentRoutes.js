const express = require("express");
const router  = express.Router();
const { chat, clearSession } = require("../controllers/agentController");

router.post("/chat",                  chat);
router.delete("/session/:sessionId",  clearSession);

module.exports = router;
