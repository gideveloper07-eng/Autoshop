const contexts = new Map();


/**
 * ==================================================
 * Get Context
 * ==================================================
 */
function getContext(userId) {

    return contexts.get(userId) || {};

}


/**
 * ==================================================
 * Update Context
 * ==================================================
 */
function updateContext(
    userId,
    data
) {

    const current =
        contexts.get(userId) || {};

    contexts.set(
        userId,
        {
            ...current,
            ...data
        }
    );

}


/**
 * ==================================================
 * Merge Parameters
 * ==================================================
 */
function mergeParameters(
    userId,
    params = {}
) {

    const context =
        getContext(userId);

    return {

        ...(context.lastParams || {}),

        ...params

    };

}


/**
 * ==================================================
 * Follow Up Detection
 * ==================================================
 */
function isFollowUp(message) {

    const text =
        String(message || "")
            .toLowerCase()
            .trim();

    return [

        "yes",
        "no",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "that one",
        "this one",
        "the first one",
        "the second one",
        "the third one",
        "the last one"

    ].some(value =>
        text === value ||
        text.includes(value)
    );

}


/**
 * ==================================================
 * Set Pending Selection
 * ==================================================
 */
function setPendingSelection(
    userId,
    selection
) {

    updateContext(

        userId,

        {
            pendingSelection: selection
        }

    );

}


/**
 * ==================================================
 * Get Pending Selection
 * ==================================================
 */
function getPendingSelection(
    userId
) {

    const context =
        getContext(userId);

    return (
        context.pendingSelection ||
        null
    );

}


/**
 * ==================================================
 * Clear Pending Selection
 * ==================================================
 */
function clearPendingSelection(
    userId
) {

    const context =
        getContext(userId);

    delete context.pendingSelection;

    contexts.set(
        userId,
        context
    );

}


module.exports = {

    getContext,

    updateContext,

    mergeParameters,

    isFollowUp,

    setPendingSelection,

    getPendingSelection,

    clearPendingSelection

};