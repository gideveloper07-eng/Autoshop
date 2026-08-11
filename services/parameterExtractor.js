const {
    parseDateRange
} = require("./dateParser");

const {
    resolveFilters
} = require("./filterResolver");

/**
 * ==================================================
 * PARAMETER EXTRACTOR
 * ==================================================
 *
 * Extracts:
 *
 * 1. Date filters
 * 2. Entity filters
 *
 * IMPORTANT:
 *
 * Entity ambiguity MUST be passed back to aiRouter.
 *
 * Example:
 *
 * "nexon stock"
 *
 * If multiple models match:
 *
 * NEXON
 * NEXON EV
 * NEXON EV 2.0
 * NEXON EV 3.0
 * NEXON ICNG
 *
 * filterResolver throws a special error with:
 *
 * selectionRequired = true
 * entityType
 * options
 *
 * We MUST NOT swallow that error.
 *
 * Entity cache failure is different:
 * If the cache itself is unavailable, AI can continue
 * without entity filtering.
 * ==================================================
 */
/**
 * ==================================================
 * STOCK THRESHOLD
 * ==================================================
 */

function extractStockThreshold(message) {

    const text =
        String(message || "")
            .toLowerCase();

    const patterns = [

        /(?:less than|below|under|fewer than|maximum of)\s+(\d+)/i,

        /(\d+)\s*(?:or less|and below)/i

    ];

    for (const pattern of patterns) {

        const match =
            text.match(pattern);

        if (match) {

            const value =
                Number(match[1]);

            if (
                Number.isInteger(value) &&
                value >= 0
            ) {

                return value;

            }

        }

    }

    return undefined;
}
async function extractParameters(
    message,
    context
) {

    //--------------------------------------------------
    // Date Filters
    //--------------------------------------------------

    const dateFilters =
    parseDateRange(message);

const stockThreshold =
    extractStockThreshold(message);

    //--------------------------------------------------
    // Entity Filters
    //--------------------------------------------------

    let entityFilters = {};

    try {

        entityFilters =
            await resolveFilters(
                message,
                context
            );

    }

    catch (err) {

        console.log("--------------------------------------");
        console.log("ENTITY FILTER ERROR");
        console.log("Message :", message);
        console.log("Error   :", err.message);
        console.log("--------------------------------------");

        //--------------------------------------------------
        // IMPORTANT:
        //
        // Model / Variant selection is NOT a normal error.
        //
        // Pass it back to aiRouter so it can display:
        //
        // 1. NEXON
        // 2. NEXON EV
        // 3. NEXON EV 2.0
        // ...
        //--------------------------------------------------

        if (
            err.selectionRequired === true
        ) {

            console.log(
                "SELECTION REQUIRED - PASSING TO ROUTER"
            );

            throw err;

        }

        //--------------------------------------------------
        // Entity cache unavailable
        //
        // This is safe to ignore.
        //--------------------------------------------------

        console.log(
            "Entity resolution failed."
        );

        console.log(
            "Continuing without entity filters..."
        );

        console.log("--------------------------------------");

        entityFilters = {};

    }

    //--------------------------------------------------
    // Merge Date + Entity Filters
    //--------------------------------------------------

    const params = {

    ...dateFilters,

    ...entityFilters

};

if (
    stockThreshold !== undefined
) {

    params.stockThreshold =
        stockThreshold;

}

    //--------------------------------------------------
    // Remove Empty Values
    //--------------------------------------------------

    Object.keys(params).forEach(
        key => {

            if (
                params[key] === undefined ||
                params[key] === null ||
                params[key] === ""
            ) {

                delete params[key];

            }

        }
    );

    //--------------------------------------------------
    // Logging
    //--------------------------------------------------

    console.log("--------------------------------------");
    console.log("EXTRACTED PARAMETERS");
    console.table(params);
    console.log("--------------------------------------");

    return params;

}

module.exports = {

    extractParameters

};