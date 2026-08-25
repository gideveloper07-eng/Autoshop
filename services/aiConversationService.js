const crypto = require("crypto");
const sql = require("mssql");

const { getPool } = require("../config/db");


// ==========================================================
// CREATE CONVERSATION ID
// ==========================================================

function newConversationId() {
    return crypto.randomUUID();
}


// ==========================================================
// ENSURE CONVERSATION
// ==========================================================

async function ensureConversation({
    conversationId,
    userId,
    database,
    propertyCode = null,
    propertyName = null
}) {

    // Always guarantee an ID
    const id = conversationId || newConversationId();

    try {

        const pool = await getPool(database);

        // --------------------------------------------------
        // Existing conversation
        // --------------------------------------------------

        if (conversationId) {

            const existing =
                await pool.request()

                    .input(
                        "conversationId",
                        sql.UniqueIdentifier,
                        conversationId
                    )

                    .input(
                        "userId",
                        sql.NVarChar(100),
                        String(userId || "")
                    )

                    .input(
                        "databaseName",
                        sql.NVarChar(255),
                        String(database || "")
                    )

                    .query(`
                        SELECT TOP 1
                            conversation_id
                        FROM dbo.ai_conversations
                        WHERE conversation_id = @conversationId
                          AND user_id = @userId
                          AND database_name = @databaseName
                          AND is_archived = 0
                    `);


            if (existing.recordset.length > 0) {

                return {
                    ok: true,
                    conversationId: id,
                    created: false
                };
            }
        }


        // --------------------------------------------------
        // Create new conversation
        // --------------------------------------------------

        await pool.request()

            .input(
                "conversationId",
                sql.UniqueIdentifier,
                id
            )

            .input(
                "userId",
                sql.NVarChar(100),
                String(userId || "")
            )

            .input(
                "databaseName",
                sql.NVarChar(255),
                String(database || "")
            )

            .input(
                "title",
                sql.NVarChar(500),
                "New Chat"
            )

            .query(`
                INSERT INTO dbo.ai_conversations
                (
                    conversation_id,
                    user_id,
                    database_name,
                    title,
                    created_at,
                    updated_at,
                    is_archived
                )
                VALUES
                (
                    @conversationId,
                    @userId,
                    @databaseName,
                    @title,
                    SYSUTCDATETIME(),
                    SYSUTCDATETIME(),
                    0
                )
            `);


        return {
            ok: true,
            conversationId: id,
            created: true
        };

    } catch (err) {

        console.error(
            "AI CONVERSATION WARNING:",
            err.message
        );

        // Important:
        // Never stop the existing AI because history failed.

        return {
            ok: false,
            conversationId: id,
            created: false
        };
    }
}


// ==========================================================
// SAVE MESSAGE
// ==========================================================

async function saveMessage({
    conversationId,
    database,
    role,
    message,
    domain = null,
    action = null
}) {

    if (!conversationId) {

        console.error(
            "AI MESSAGE HISTORY SKIPPED: conversationId missing"
        );

        return false;
    }

    try {

        const pool = await getPool(database);
console.log("======================================");
console.log("AI HISTORY DB DEBUG");
console.log("Requested database :", database);

const dbCheck = await pool.request().query(`
    SELECT
        DB_NAME() AS CurrentDatabase,
        OBJECT_ID('dbo.ai_chat_messages') AS ChatMessagesObjectId,
        OBJECT_ID('dbo.ai_conversations') AS ConversationsObjectId
`);

console.table(dbCheck.recordset);

console.log("======================================");
        await pool.request()

            .input(
                "conversationId",
                sql.UniqueIdentifier,
                conversationId
            )

            .input(
                "role",
                sql.VarChar(20),
                role
            )

            .input(
                "message",
                sql.NVarChar(sql.MAX),
                String(message ?? "")
            )

            .input(
                "domain",
                sql.NVarChar(100),
                domain
            )

            .input(
                "action",
                sql.NVarChar(100),
                action
            )

            .query(`
                INSERT INTO dbo.ai_chat_messages
                (
                    conversation_id,
                    role,
                    message,
                    domain,
                    action,
                    created_at
                )
                VALUES
                (
                    @conversationId,
                    @role,
                    @message,
                    @domain,
                    @action,
                    SYSUTCDATETIME()
                );

                UPDATE dbo.ai_conversations
                SET updated_at = SYSUTCDATETIME()
                WHERE conversation_id = @conversationId;
            `);

        return true;

    } catch (err) {

        console.error(
            "AI MESSAGE HISTORY WARNING:",
            err.message
        );

        return false;
    }
}


// ==========================================================
// GET CONVERSATION HISTORY
// ==========================================================

async function getConversationHistory({
    conversationId,
    userId,
    database,
    limit = 100
}) {

    if (!conversationId) {
        return [];
    }

    try {

        const pool = await getPool(database);

        const result =
            await pool.request()

                .input(
                    "conversationId",
                    sql.UniqueIdentifier,
                    conversationId
                )

                .input(
                    "userId",
                    sql.NVarChar(100),
                    String(userId || "")
                )

                .input(
                    "databaseName",
                    sql.NVarChar(255),
                    String(database || "")
                )

                .input(
                    "limit",
                    sql.Int,
                    Math.min(
                        Math.max(Number(limit) || 100, 1),
                        100
                    )
                )

                .query(`
                    SELECT TOP (@limit)
                        id,
                        conversation_id,
                        role,
                        message,
                        domain,
                        action,
                        created_at
                    FROM dbo.ai_chat_messages
                    WHERE conversation_id = @conversationId
                    ORDER BY
                        created_at ASC,
                        id ASC
                `);

        return result.recordset;

    } catch (err) {

        console.error(
            "AI HISTORY READ WARNING:",
            err.message
        );

        return [];
    }
}


// ==========================================================
// LIST CONVERSATIONS
// ==========================================================

async function listConversations({
    userId,
    database,
    limit = 50
}) {

    try {

        const pool = await getPool(database);

        const result =
            await pool.request()

                .input(
                    "userId",
                    sql.NVarChar(100),
                    String(userId || "")
                )

                .input(
                    "databaseName",
                    sql.NVarChar(255),
                    String(database || "")
                )

                .input(
                    "limit",
                    sql.Int,
                    Math.min(
                        Math.max(Number(limit) || 50, 1),
                        100
                    )
                )

                .query(`
                    SELECT TOP (@limit)
                        conversation_id,
                        user_id,
                        database_name,
                        title,
                        created_at,
                        updated_at,
                        is_archived
                    FROM dbo.ai_conversations
                    WHERE user_id = @userId
                      AND database_name = @databaseName
                      AND is_archived = 0
                    ORDER BY
                        updated_at DESC,
                        created_at DESC
                `);

        return result.recordset;

    } catch (err) {

        console.error(
            "AI CONVERSATION LIST WARNING:",
            err.message
        );

        return [];
    }
}


// ==========================================================
// DELETE / ARCHIVE CONVERSATION
// ==========================================================

async function deleteConversation({
    conversationId,
    userId,
    database
}) {

    if (!conversationId) {
        return false;
    }

    try {

        const pool = await getPool();

        await pool.request()

            .input(
                "conversationId",
                sql.UniqueIdentifier,
                conversationId
            )

            .input(
                "userId",
                sql.NVarChar(100),
                String(userId || "")
            )

            .input(
                "databaseName",
                sql.NVarChar(255),
                String(database || "")
            )

            .query(`
                UPDATE dbo.ai_conversations
                SET
                    is_archived = 1,
                    updated_at = SYSUTCDATETIME()
                WHERE conversation_id = @conversationId
                  AND user_id = @userId
                  AND database_name = @databaseName
            `);

        return true;

    } catch (err) {

        console.error(
            "AI CONVERSATION DELETE WARNING:",
            err.message
        );

        return false;
    }
}


module.exports = {
    newConversationId,
    ensureConversation,
    saveMessage,
    getConversationHistory,
    listConversations,
    deleteConversation
};