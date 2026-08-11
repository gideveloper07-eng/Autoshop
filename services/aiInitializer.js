/**
 * ==================================================
 * AI ENTITY CACHE INITIALIZER
 * ==================================================
 *
 * Entity cache is loaded per dealership database
 * on demand.
 *
 * Startup:
 *
 *     initializeAI()
 *
 * does NOT load every dealership database.
 *
 * The actual cache is loaded when an AI request
 * provides:
 *
 *     context.dealership.database
 *
 * Example:
 *
 *     TATADEMO
 *
 * ==================================================
 */

const {
    ensureEntityCache
} = require("./entityLoader");


/**
 * ==================================================
 * Initialize AI
 * ==================================================
 *
 * This function intentionally does NOT load all
 * dealership databases.
 *
 */
async function initializeAI() {

    console.log("");
    console.log("======================================");
    console.log("INITIALIZING AI");
    console.log("======================================");

    console.log(
        "AI Entity Cache Mode : ON-DEMAND"
    );

    console.log(
        "Entity caches will be loaded per dealership."
    );

    console.log(
        "======================================"
    );

    return true;

}


/**
 * ==================================================
 * Ensure Dealership Cache
 * ==================================================
 *
 * Loads the cache only for the database associated
 * with the current employee.
 *
 * Example:
 *
 *     await ensureDealershipCache("TATADEMO");
 *
 */
async function ensureDealershipCache(database) {

    if (!database) {

        throw new Error(
            "Dealership database is required for AI entity cache."
        );

    }

    console.log("--------------------------------------");
    console.log(
        `Ensuring Entity Cache : ${database}`
    );
    console.log("--------------------------------------");

    const cache =
        await ensureEntityCache(
            database
        );

    return cache;

}


module.exports = {

    initializeAI,

    ensureDealershipCache

};