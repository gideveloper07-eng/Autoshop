/**
 * ==================================================
 * AI SELECTION STATE
 * ==================================================
 *
 * Stores pending entity selections.
 *
 * Example:
 *
 * User asks:
 *
 *     nexon stock
 *
 * AI finds:
 *
 *     1. NEXON
 *     2. NEXON EV
 *     3. NEXON EV 2.0
 *
 * The selection is stored here.
 *
 * When user replies:
 *
 *     3
 *
 * we know that 3 means NEXON EV 2.0.
 *
 * ==================================================
 */

const selections = new Map();


/**
 * Create a user/session key.
 */
function getKey(context) {

    return (
        context?.identity?.userId ||
        context?.identity?.userCode ||
        context?.userId ||
        "default"
    )
    .toString();

}


/**
 * Save pending selection.
 */
function setPendingSelection(
    context,
    selection
) {

    const key =
        getKey(context);

    selections.set(
        key,
        {
            ...selection,
            createdAt: Date.now()
        }
    );

    console.log(
        "======================================"
    );

    console.log(
        "PENDING SELECTION SAVED"
    );

    console.log(
        "Key        :",
        key
    );

    console.log(
        "Entity     :",
        selection.entityType
    );

    console.log(
        "Options    :",
        selection.options?.length || 0
    );

    console.log(
        "======================================");

}


/**
 * Get pending selection.
 */
function getPendingSelection(context) {

    const key =
        getKey(context);

    return selections.get(key) || null;

}


/**
 * Clear pending selection.
 */
function clearPendingSelection(context) {

    const key =
        getKey(context);

    selections.delete(key);

}


/**
 * Resolve numeric selection.
 */
function resolvePendingSelection(
    context,
    number
) {

    const pending =
        getPendingSelection(context);

    if (!pending) {

        return null;

    }

    const index =
        Number(number) - 1;

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= pending.options.length
    ) {

        return null;

    }

    const selected =
        pending.options[index];

    clearPendingSelection(context);

    return selected;

}


module.exports = {

    setPendingSelection,

    getPendingSelection,

    clearPendingSelection,

    resolvePendingSelection

};