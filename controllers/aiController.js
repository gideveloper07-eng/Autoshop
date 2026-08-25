const { runAI } = require("../services/aiEngine");

const {
  ensureConversation,
  saveMessage,
  getConversationHistory,
  listConversations,
  deleteConversation,
} = require("../services/aiConversationService");


/**
 * ==========================================================
 * BUILD AI CONTEXT
 * ==========================================================
 */
function buildAIContext(
  req,
  conversationId,
  conversationHistory
) {
  return {
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

    conversation: {
      conversationId,

      history: Array.isArray(conversationHistory)
        ? conversationHistory.map(row => ({
            role: row.role,
            message: row.message,
            domain: row.domain,
            action: row.action,
            createdAt: row.created_at,
          }))
        : [],
    },
  };
}


/**
 * ==========================================================
 * POST /api/ai/chat
 * ==========================================================
 */
exports.chat = async (req, res) => {

  try {

    const {
      message,
      conversationId,
    } = req.body;


    // ======================================================
    // VALIDATE MESSAGE
    // ======================================================

    if (!message || !String(message).trim()) {

      return res.status(400).json({
        success: false,
        message: "Message is required",
      });

    }


    // ======================================================
    // ENSURE CONVERSATION
    // ======================================================

    const historyInfo =
      await ensureConversation({

        conversationId,

        userId:
          req.user.userId,

        database:
          req.user.database,

        propertyCode:
          req.user.propertyCode,

        propertyName:
          req.user.propertyName,

      });


    const activeConversationId =
      historyInfo.conversationId;


    // ======================================================
    // LOAD PREVIOUS CONVERSATION HISTORY
    // ======================================================

    let conversationHistory = [];


    if (activeConversationId) {

      conversationHistory =
        await getConversationHistory({

          conversationId:
            activeConversationId,

          userId:
            req.user.userId,

          database:
            req.user.database,

          limit: 20,

        });

    }


    console.log(
      "======================================"
    );

    console.log(
      "AI CONVERSATION MEMORY"
    );

    console.log(
      "Conversation ID :",
      activeConversationId
    );

    console.log(
      "History Count   :",
      conversationHistory.length
    );

    console.log(
      "======================================"
    );


    // ======================================================
    // BUILD AI CONTEXT WITH MEMORY
    // ======================================================

    const aiContext =
      buildAIContext(
        req,
        activeConversationId,
        conversationHistory
      );


    // ======================================================
    // SAVE USER MESSAGE
    // ======================================================

    await saveMessage({

      conversationId:
        activeConversationId,

      database:
        req.user.database,

      role:
        "user",

      message:
        message,

    });


    // ======================================================
    // RUN AI
    // ======================================================

    const reply =
      await runAI(
        message,
        aiContext
      );


    // ======================================================
    // SAVE AI RESPONSE
    // ======================================================

    await saveMessage({

      conversationId:
        activeConversationId,

      database:
        req.user.database,

      role:
        "assistant",

      message:
        reply,

    });


    // ======================================================
    // RESPONSE
    // ======================================================

    return res.json({

      success:
        true,

      conversationId:
        activeConversationId,

      reply,

    });


  } catch (err) {

    console.error(
      "AI CHAT ERROR:",
      err
    );


    return res.status(500).json({

      success:
        false,

      message:
        err.message,

    });

  }

};


/**
 * ==========================================================
 * GET /api/ai/conversations
 * ==========================================================
 */
exports.listConversations = async (req, res) => {

  try {

    const conversations =
      await listConversations({

        userId:
          req.user.userId,

        database:
          req.user.database,

      });


    return res.json({

      success:
        true,

      conversations,

    });


  } catch (err) {

    console.error(
      "AI CONVERSATIONS ERROR:",
      err
    );


    return res.status(500).json({

      success:
        false,

      message:
        err.message,

    });

  }

};


/**
 * ==========================================================
 * GET /api/ai/conversations/:conversationId
 * ==========================================================
 */
exports.getConversation = async (req, res) => {

  try {

    const {
      conversationId,
    } = req.params;


    const messages =
      await getConversationHistory({

        conversationId,

        userId:
          req.user.userId,

        database:
          req.user.database,

        limit:
          100,

      });


    return res.json({

      success:
        true,

      conversationId,

      messages,

    });


  } catch (err) {

    console.error(
      "AI CONVERSATION READ ERROR:",
      err
    );


    return res.status(500).json({

      success:
        false,

      message:
        err.message,

    });

  }

};


/**
 * ==========================================================
 * POST /api/ai/conversations
 *
 * Creates a new conversation.
 * ==========================================================
 */
exports.createConversation = async (req, res) => {

  try {

    const result =
      await ensureConversation({

        userId:
          req.user.userId,

        database:
          req.user.database,

        propertyCode:
          req.user.propertyCode,

        propertyName:
          req.user.propertyName,

      });


    return res.json({

      success:
        true,

      conversationId:
        result.conversationId,

    });


  } catch (err) {

    console.error(
      "AI CREATE CONVERSATION ERROR:",
      err
    );


    return res.status(500).json({

      success:
        false,

      message:
        err.message,

    });

  }

};


/**
 * ==========================================================
 * DELETE /api/ai/conversations/:conversationId
 * ==========================================================
 */
exports.deleteConversation = async (req, res) => {

  try {

    const {
      conversationId,
    } = req.params;


    const deleted =
      await deleteConversation({

        conversationId,

        userId:
          req.user.userId,

        database:
          req.user.database,

      });


    return res.json({

      success:
        deleted,

      conversationId,

    });


  } catch (err) {

    console.error(
      "AI DELETE CONVERSATION ERROR:",
      err
    );


    return res.status(500).json({

      success:
        false,

      message:
        err.message,

    });

  }

};