const express = require("express");
const router  = express.Router();
const { getProfile, saveProfile, uploadFields, saveDeviceToken } = require("../controllers/profileController");

router.get("/",  getProfile);
router.post("/", uploadFields, saveProfile);
router.post("/device-token", saveDeviceToken);

module.exports = router;
