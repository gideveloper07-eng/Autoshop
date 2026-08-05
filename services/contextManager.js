/**
 * Context Manager
 *
 * Stores conversation context per logged-in user.
 */

const conversationContext = new Map();

const CONTEXT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function getContext(userId) {

    if (!conversationContext.has(userId)) {

        conversationContext.set(userId, {

            lastIntent: null,

            lastTool: null,

            lastTools: null,

            lastParams: {},

            lastQuestion: null,

            summary: false,

            updatedAt: new Date()

        });

    }

    const context = conversationContext.get(userId);

    // Expire old context
    if (
        context.updatedAt &&
        Date.now() - context.updatedAt.getTime() > CONTEXT_TIMEOUT
    ) {

        conversationContext.delete(userId);

        return getContext(userId);

    }

    return context;

}

function updateContext(userId, values) {

    const context = getContext(userId);

    Object.assign(context, values);

    context.updatedAt = new Date();

}

function mergeParameters(userId, params = {}) {

    const context = getContext(userId);

    return {

        ...(context.lastParams || {}),

        ...params

    };

}

function clearContext(userId) {

    conversationContext.delete(userId);

}

function clearAllContexts() {

    conversationContext.clear();

}

function isFollowUp(message) {

    const text = message.trim().toLowerCase();

    const starters = [

        "only",

        "also",

        "compare",

        "same",

        "what about",

        "and",

        "yesterday",

        "today",

        "this month",

        "last month"

    ];

    return starters.some(word => text.startsWith(word));

}

module.exports = {

    getContext,

    updateContext,

    mergeParameters,

    clearContext,

    clearAllContexts,

    isFollowUp

};