const { getPool } = require("../config/db");

const entityConfig =
    require("../config/entityConfig");

const {
    setCache,
    hasCache,
    getCache
} = require("./entityCache");


/**
 * ==================================================
 * Load One Entity
 * ==================================================
 */
async function loadEntity(pool, entity) {

    try {

        const result =
            await pool
                .request()
                .query(entity.query);

        console.log(
            `Loaded ${entity.name}: ${result.recordset.length}`
        );

        return result.recordset;

    }
    catch (err) {

        console.error(
            `❌ Failed loading ${entity.name}`
        );

        console.error(
            err.message
        );

        throw err;

    }

}


/**
 * ==================================================
 * Load Entity Cache
 * ==================================================
 *
 * Loads all configured entities for ONE dealership.
 *
 * Example:
 *
 *     loadEntityCache("TATADEMO")
 *
 * This function should only be called when we
 * actually need the dealership cache.
 *
 * ==================================================
 */
async function loadEntityCache(database) {

    if (!database) {

        throw new Error(
            "Database is required to load entity cache."
        );

    }

    console.log("");
    console.log("======================================");
    console.log(
        `Loading Entity Cache : ${database}`
    );
    console.log("======================================");

    //--------------------------------------------------
    // Database Pool
    //--------------------------------------------------

    const pool =
        await getPool(database);

    //--------------------------------------------------
    // Empty Cache
    //--------------------------------------------------

    const cache = {

        initialized: false,

        loadedAt: null,

        branches: [],

        models: [],

        variants: [],

        colours: [],

        fuels: [],

        transmissions: [],

        executives: [],

        workshops: [],

        financeCompanies: [],

        customers: [],

        vendors: []

    };

    //--------------------------------------------------
    // Load Entities
    //--------------------------------------------------

    for (const entity of entityConfig) {

        console.log(
            `Loading ${entity.name}...`
        );

        cache[entity.key] =
            await loadEntity(

                pool,

                entity

            );

    }

    //--------------------------------------------------
    // Mark Initialized
    //--------------------------------------------------

    cache.initialized = true;

    cache.loadedAt = new Date();

    //--------------------------------------------------
    // Save
    //--------------------------------------------------

    setCache(

        database,

        cache

    );

    //--------------------------------------------------
    // Verification
    //--------------------------------------------------

    console.log("");
    console.log(
        `ENTITY CACHE SAVED : ${database}`
    );

    console.log(
        "Models       :",
        cache.models.length
    );

    console.log(
        "Variants     :",
        cache.variants.length
    );

    console.log(
        "Colours      :",
        cache.colours.length
    );

    console.log(
        "Fuels        :",
        cache.fuels.length
    );

    console.log(
        "Branches     :",
        cache.branches.length
    );

    console.log(
        "Executives   :",
        cache.executives.length
    );

    console.log(
        "Customers    :",
        cache.customers.length
    );

    console.log("");

    return cache;

}


/**
 * ==================================================
 * Ensure Entity Cache
 * ==================================================
 *
 * Returns existing cache if already loaded.
 *
 * Otherwise loads the cache for that dealership.
 *
 * This is the function that filterResolver should
 * use.
 *
 * ==================================================
 */
async function ensureEntityCache(database) {

    if (!database) {

        throw new Error(
            "Database is required for entity cache."
        );

    }

    //--------------------------------------------------
    // Check existing cache
    //--------------------------------------------------

    if (hasCache(database)) {

        const cache =
            getCache(database);

        console.log(
            `✅ Using existing Entity Cache : ${database}`
        );

        return cache;

    }

    //--------------------------------------------------
    // Cache does not exist
    //--------------------------------------------------

    console.log("");
    console.log("--------------------------------------");
    console.log(
        `Entity Cache not found : ${database}`
    );
    console.log(
        `Loading cache for : ${database}`
    );
    console.log("--------------------------------------");

    //--------------------------------------------------
    // Load
    //--------------------------------------------------

    const cache =
        await loadEntityCache(
            database
        );

    //--------------------------------------------------
    // Verify
    //--------------------------------------------------

    if (!hasCache(database)) {

        throw new Error(
            `Entity cache was not saved for '${database}'.`
        );

    }

    console.log(
        `✅ Entity Cache Ready : ${database}`
    );

    return cache;

}


module.exports = {

    loadEntityCache,

    ensureEntityCache

};