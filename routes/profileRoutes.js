const express = require("express");
const router  = express.Router();
const { getProfile, saveProfile, uploadFields } = require("../controllers/profileController");

router.get("/",  getProfile);
router.post("/", uploadFields, saveProfile);

module.exports = router;
