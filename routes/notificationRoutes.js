const router = require("express").Router();

const verifyToken = require("../middleware/authMiddleware");

//const { getNotifications } = require("../controllers/notificationController");
const {markNotificationAsRead} = require("../controllers/notificationController");
const {
  getNotifications,
  getUnreadNotificationCount,
} = require("../controllers/notificationController");

router.get("/notifications", verifyToken, getNotifications);

router.get(
  "/notifications/unread-count",
  verifyToken,
  getUnreadNotificationCount,
);

router.post("/notifications/read/:id", verifyToken, markNotificationAsRead);

module.exports = router;
