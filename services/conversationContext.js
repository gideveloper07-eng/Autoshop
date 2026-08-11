/**
 * ==================================================
 * MYAUTOSHOP AI
 * CONVERSATION CONTEXT MANAGER
 * ==================================================
 *
 * Stores short-lived conversational context.
 *
 * Example:
 *
 * User:
 *     Nexon EV 2.0 stock
 *
 * AI:
 *     8 vehicles available.
 *
 * User:
 *     How many are Fearless?
 *
 * Context remembers:
 *
 *     domain  = vehicle
 *     action  = stock
 *     model   = NEXON EV 2.0
 *
 * ==================================================
 */

const conversations = new Map();


//====================================================
// CONFIGURATION
//====================================================

const CONTEXT_TTL =
    30 * 60 * 1000; // 30 minutes


//====================================================
// Normalize User Key
//====================================================

function normalizeKey(value) {

    return String(value || "")
        .trim()
        .toUpperCase();

}


//====================================================
// Build Conversation Key
//====================================================
//
// IMPORTANT:
//
// User ID alone is not enough.
//
// Same employee could potentially work with
// different dealership databases.
//
// Therefore:
//
// DATABASE + USER
//
//====================================================

function getConversationKey(context) {

    const database =
        normalizeKey(
            context?.dealership?.database
        );

    const userId =
        normalizeKey(
            context?.identity?.userId ||
            context?.identity?.userGuid ||
            context?.identity?.userCode
        );

    return `${database}:${userId}`;

}


//====================================================
// Create Empty Context
//====================================================

function createContext() {

    return {

        createdAt:
            Date.now(),

        updatedAt:
            Date.now(),

        //--------------------------------------------------
        // Last successful request
        //--------------------------------------------------

        lastDomain:
            null,

        lastAction:
            null,

        lastQuestion:
            null,

        lastParams:
            {},

        lastResult:
            null,

        //--------------------------------------------------
        // Pending clarification
        //--------------------------------------------------

        pendingSelection:
            null

    };

}


//====================================================
// Get Context
//====================================================

function getConversationContext(context) {

    const key =
        getConversationKey(
            context
        );

    const existing =
        conversations.get(key);

    //--------------------------------------------------
    // No context
    //--------------------------------------------------

    if (!existing) {

        const fresh =
            createContext();

        conversations.set(
            key,
            fresh
        );

        return fresh;

    }


    //--------------------------------------------------
    // Expired
    //--------------------------------------------------

    if (
        Date.now() -
        existing.updatedAt >
        CONTEXT_TTL
    ) {

        const fresh =
            createContext();

        conversations.set(
            key,
            fresh
        );

        return fresh;

    }


    return existing;

}


//====================================================
// Save / Update Context
//====================================================

function updateConversationContext(
    context,
    updates = {}
) {

    const key =
        getConversationKey(
            context
        );

    const current =
        getConversationContext(
            context
        );

    const updated = {

        ...current,

        ...updates,

        updatedAt:
            Date.now()

    };

    conversations.set(
        key,
        updated
    );

    return updated;

}


//====================================================
// Clear Context
//====================================================

function clearConversationContext(
    context
) {

    const key =
        getConversationKey(
            context
        );

    conversations.delete(
        key
    );

}


//====================================================
// Clear Pending Selection
//====================================================

function clearPendingSelection(
    context
) {

    return updateConversationContext(
        context,
        {
            pendingSelection:
                null
        }
    );

}


//====================================================
// Set Pending Selection
//====================================================

function setPendingSelection(
    context,
    selection
) {

    return updateConversationContext(
        context,
        {
            pendingSelection:
                selection
        }
    );

}


//====================================================
// Get Pending Selection
//====================================================

function getPendingSelection(
    context
) {

    const conversation =
        getConversationContext(
            context
        );

    return conversation
        .pendingSelection || null;

}


//====================================================
// Follow-up Detection
//====================================================

function isFollowUp(message) {

    const text =
        String(message || "")
            .toLowerCase()
            .trim();

    if (!text) {
        return false;
    }


    //--------------------------------------------------
    // Very short messages
    //--------------------------------------------------

    if (
        text === "same" ||
        text === "same one" ||
        text === "that" ||
        text === "that one" ||
        text === "this one" ||
        text === "those" ||
        text === "those ones"
    ) {

        return true;

    }


    //--------------------------------------------------
    // Follow-up phrases
    //--------------------------------------------------

    const phrases = [

        "what about",
        "how about",

        "what about that",
        "how about that",

        "same model",
        "same variant",
        "same colour",
        "same color",
        "same fuel",
        "same branch",

        "that model",
        "that variant",
        "that colour",
        "that color",

        "those vehicles",
        "those bookings",
        "those sales",

        "how many are",
        "how many of them",

        "which colour",
        "which color",
        "which variant",
        "which fuel",

        "what is the stock of it",
        "what is its stock",

        "show more",
        "show details",
        "tell me more",

        "and the",
        "and what about"

    ];


    if (
        phrases.some(
            phrase =>
                text.includes(
                    phrase
                )
        )
    ) {

        return true;

    }


    //--------------------------------------------------
    // Pronoun based follow-up
    //--------------------------------------------------

    const pronouns = [

        "it",
        "its",
        "that",
        "this",
        "those",
        "them",
        "they"

    ];


    const words =
        text.split(/\s+/);


    if (
        words.length <= 8 &&
        pronouns.some(
            word =>
                words.includes(word)
        )
    ) {

        return true;

    }


    return false;

}


//====================================================
// Merge Previous Filters
//====================================================
//
// New filters always WIN.
//
// Previous filters are used only when missing.
//
// Example:
//
// Previous:
//     model = NEXON EV 2.0
//
// New:
//     variant = FEARLESS
//
// Result:
//
//     model = NEXON EV 2.0
//     variant = FEARLESS
//
//====================================================

function mergePreviousFilters(
    previousParams = {},
    currentParams = {}
) {

    const merged = {

        ...previousParams,

        ...currentParams

    };


    //--------------------------------------------------
    // Never carry internal clarification fields
    //--------------------------------------------------

    delete merged.needsClarification;
    delete merged.clarificationType;
    delete merged.question;
    delete merged.options;


    return merged;

}


//====================================================
// Store Successful Request
//====================================================

function rememberRequest(
    context,
    {
        domain,
        action,
        params = {},
        result = null,
        question = null
    }
) {

    return updateConversationContext(
        context,
        {

            lastDomain:
                domain,

            lastAction:
                action,

            lastQuestion:
                question,

            lastParams:
                {
                    ...params
                },

            lastResult:
                result

        }
    );

}


//====================================================
// Cache Statistics
//====================================================

function getConversationInfo() {

    const result = [];

    for (
        const [key, value]
        of conversations.entries()
    ) {

        result.push({

            key,

            lastDomain:
                value.lastDomain,

            lastAction:
                value.lastAction,

            lastQuestion:
                value.lastQuestion,

            pendingType:
                value.pendingSelection?.type ||
                null,

            updatedAt:
                new Date(
                    value.updatedAt
                )

        });

    }

    return result;

}


//====================================================
// Exports
//====================================================

module.exports = {

    getConversationKey,

    getConversationContext,

    updateConversationContext,

    clearConversationContext,

    isFollowUp,

    mergePreviousFilters,

    rememberRequest,

    setPendingSelection,

    getPendingSelection,

    clearPendingSelection,

    getConversationInfo

};