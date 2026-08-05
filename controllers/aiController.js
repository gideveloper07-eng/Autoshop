const { runAI } = require("../services/aiEngine");

exports.chat = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Create AI Context
    const aiContext = {
      identity: {
        userId: req.user.userId,
        userName: req.user.userName,
        userGuid: req.user.userGuid,
        isAdmin: req.user.isAdmin,
        utg: req.user.utg,
      },

      dealership: {
        database: req.user.database,
        propertyCode: req.user.propertyCode,
        propertyName: req.user.propertyName,
        clientId: req.user.clientId,
        branchUnq: req.user.branchUnq,
      },
    };

    const reply = await runAI(message, aiContext);

    return res.json({
      success: true,
      reply,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};