const router = require("express").Router();

const { verifyToken } = require("../middleware/authMiddleware");

//const { getNotifications } = require("../controllers/notificationController");

const {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
} = require("../controllers/notificationController");

const {
  sendReceiptChangeNotification,
} = require("../utils/receiptChangeNotification");


router.get("/notifications", verifyToken, getNotifications);

router.get(
  "/notifications/unread-count",
  verifyToken,
  getUnreadNotificationCount,
);

router.post("/notifications/read/:id", verifyToken, markNotificationAsRead);

router.post(
  "/notifications/receipt-change-request",
  async (req, res) => {
    try {
      // --------------------------------------------------------
      // Internal API protection
      // --------------------------------------------------------
      const internalKey = req.headers["x-internal-key"];

      if (
        !internalKey ||
        internalKey !== process.env.INTERNAL_API_KEY
      ) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }


      const {
        databaseName,
        requestId,
        receiptNo,
        requestType,
      } = req.body;


      if (
        !databaseName ||
        !requestId ||
        !requestType
      ) {
        return res.status(400).json({
          success: false,
          message:
            "databaseName, requestId and requestType are required",
        });
      }


      const result =
        await sendReceiptChangeNotification({
          databaseName,
          requestId,
          receiptNo,
          requestType,
        });


      return res.json(result);

    } catch (err) {
      console.error(
        "RECEIPT CHANGE NOTIFICATION ROUTE ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);
module.exports = router;
