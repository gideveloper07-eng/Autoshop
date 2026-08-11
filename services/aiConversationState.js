/**
 * ==================================================
 * AI CONVERSATION STATE
 * ==================================================
 *
 * Stores short-lived pending selections for the AI.
 *
 * Example:
 *
 * User:  Nexon stock
 * AI:    Multiple models found...
 * User:  3
 *
 * The state remembers that "3" is a MODEL selection
 * for the previous stock request.
 *
 * State is kept per dealership database + employee.
 */

const pendingSelections = new Map();

function makeKey(context) {
    const database =
        context?.dealership?.database ||
        "UNKNOWN_DB";

    const user =
        context?.identity?.userId ||
        context?.identity?.userCode ||
        context?.identity?.userName ||
        "anonymous";

    return `${String(database).toUpperCase().trim()}:${String(user).toLowerCase().trim()}`;
}

function setPendingSelection(context, selection) {
    const key = makeKey(context);

    pendingSelections.set(key, {
        ...selection,
        createdAt: new Date()
    });

    console.log("======================================");
    console.log("PENDING AI SELECTION SAVED");
    console.log("KEY         :", key);
    console.log("DOMAIN      :", selection.domain);
    console.log("ACTION      :", selection.action);
    console.log("ENTITY TYPE :", selection.entityType);
    console.log(
        "OPTIONS     :",
        selection.candidates?.length || 0
    );
    console.log("======================================");
}

function getPendingSelection(context) {
    return pendingSelections.get(makeKey(context)) || null;
}

function clearPendingSelection(context) {
    pendingSelections.delete(makeKey(context));
}

function hasPendingSelection(context) {
    return pendingSelections.has(makeKey(context));
}

function clearAllPendingSelections() {
    pendingSelections.clear();
}

function getPendingSelectionInfo() {
    const result = [];

    for (const [key, value] of pendingSelections.entries()) {
        result.push({
            key,
            domain: value.domain,
            action: value.action,
            entityType: value.entityType,
            options: value.candidates?.length || 0,
            createdAt: value.createdAt
        });
    }

    return result;
}

module.exports = {
    setPendingSelection,
    getPendingSelection,
    clearPendingSelection,
    hasPendingSelection,
    clearAllPendingSelections,
    getPendingSelectionInfo
};
