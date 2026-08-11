/**
 * ==================================================
 * Multi Database Entity Cache
 * ==================================================
 *
 * One cache per dealership database.
 *
 * Example:
 *
 * TATADEMO
 * HYUNDAI
 * MARUTI
 *
 */

const entityCaches = new Map();

/**
 * ==================================================
 * Normalize Database Name
 * ==================================================
 */
function normalize(database) {

    return (database || "")
        .toString()
        .toUpperCase()
        .trim();

}

/**
 * ==================================================
 * Cache Exists
 * ==================================================
 */
function hasCache(database) {

    const db = normalize(database);

    return entityCaches.has(db);

}

/**
 * ==================================================
 * Get Cache
 * ==================================================
 */
function getCache(database) {

    const db = normalize(database);

    return entityCaches.get(db);

}

/**
 * ==================================================
 * Save Cache
 * ==================================================
 */
function setCache(database, cache) {

    const db = normalize(database);

    if (!db) {

        throw new Error(
            "Cannot save entity cache without database name."
        );

    }

    entityCaches.set(

        db,

        {

            initialized: true,

            loadedAt: new Date(),

            ...cache

        }

    );

    //--------------------------------------------------
    // Verification
    //--------------------------------------------------

    const saved = entityCaches.get(db);

    console.log("--------------------------------------");
    console.log("ENTITY CACHE SAVED");
    console.log("Database :", db);
    console.log("Models   :", saved.models?.length || 0);
    console.log("Variants :", saved.variants?.length || 0);
    console.log("Colours  :", saved.colours?.length || 0);
    console.log("Fuels    :", saved.fuels?.length || 0);
    console.log("Branches :", saved.branches?.length || 0);
    console.log("Customers:", saved.customers?.length || 0);
    console.log("Executives:", saved.executives?.length || 0);
    console.log("--------------------------------------");

}

/**
 * ==================================================
 * Get Entity Cache
 * ==================================================
 */
async function getEntityCache(database) {

    const db = normalize(database);

    if (!db) {

        throw new Error(
            "Database name is required for entity cache."
        );

    }

    if (!entityCaches.has(db)) {

        throw new Error(
            `Entity cache not loaded for '${db}'.`
        );

    }

    return entityCaches.get(db);

}

/**
 * ==================================================
 * Clear One Cache
 * ==================================================
 */
function clearCache(database) {

    const db = normalize(database);

    entityCaches.delete(db);

}

/**
 * ==================================================
 * Clear All Caches
 * ==================================================
 */
function clearAllCaches() {

    entityCaches.clear();

}

/**
 * ==================================================
 * Cache Statistics
 * ==================================================
 */
function getCacheInfo() {

    const info = [];

    for (
        const [database, cache]
        of entityCaches.entries()
    ) {

        info.push({

            database,

            initialized:
                cache.initialized,

            loadedAt:
                cache.loadedAt,

            branches:
                cache.branches?.length || 0,

            models:
                cache.models?.length || 0,

            variants:
                cache.variants?.length || 0,

            colours:
                cache.colours?.length || 0,

            fuels:
                cache.fuels?.length || 0,

            transmissions:
                cache.transmissions?.length || 0,

            customers:
                cache.customers?.length || 0,

            executives:
                cache.executives?.length || 0,

            financeCompanies:
                cache.financeCompanies?.length || 0,

            vendors:
                cache.vendors?.length || 0

        });

    }

    return info;

}

/**
 * ==================================================
 * DEBUG CACHE
 * ==================================================
 *
 * Used to verify whether a particular dealership
 * cache is available during an AI request.
 *
 */
function debugCache(database) {

    const db = normalize(database);

    const cache = entityCaches.get(db);

    console.log("======================================");
    console.log("ENTITY CACHE CHECK");
    console.log("Requested Database :", database);
    console.log("Normalized Database:", db);
    console.log("Cache Exists       :", !!cache);
    console.log(
        "Loaded Databases   :",
        [...entityCaches.keys()]
    );

    if (cache) {

        console.log("Models    :", cache.models?.length || 0);
        console.log("Variants  :", cache.variants?.length || 0);
        console.log("Colours   :", cache.colours?.length || 0);
        console.log("Fuels     :", cache.fuels?.length || 0);
        console.log("Branches  :", cache.branches?.length || 0);
        console.log("Customers :", cache.customers?.length || 0);
        console.log("Executives:", cache.executives?.length || 0);

    }

    console.log("======================================");

    return cache || null;

}

/**
 * ==================================================
 * Find Entity
 * ==================================================
 */
function findEntity(
    database,
    entityType,
    text
) {

    const cache =
        getCache(database);

    if (!cache) {

        return null;

    }

    const entities =
        cache[entityType] || [];

    const message =
        (text || "")
            .toString()
            .toLowerCase()
            .trim();

    if (!message) {

        return null;

    }

    //--------------------------------------------------
    // Exact Name First
    //--------------------------------------------------

    for (const entity of entities) {

        if (!entity.name)
            continue;

        if (
            entity.name
                .toLowerCase()
                .trim() === message
        ) {

            return entity;

        }

    }

    //--------------------------------------------------
    // Exact Alias
    //--------------------------------------------------

    for (const entity of entities) {

        if (
            !Array.isArray(entity.aliases)
        ) {

            continue;

        }

        for (
            const alias
            of entity.aliases
        ) {

            if (
                alias
                    .toLowerCase()
                    .trim() === message
            ) {

                return entity;

            }

        }

    }

    //--------------------------------------------------
    // Name Contains Text
    //--------------------------------------------------

    for (const entity of entities) {

        if (!entity.name)
            continue;

        if (
            message.includes(
                entity.name
                    .toLowerCase()
                    .trim()
            )
        ) {

            return entity;

        }

    }

    //--------------------------------------------------
    // Alias Contains Text
    //--------------------------------------------------

    for (const entity of entities) {

        if (
            !Array.isArray(entity.aliases)
        ) {

            continue;

        }

        for (
            const alias
            of entity.aliases
        ) {

            if (
                message.includes(
                    alias.toLowerCase().trim()
                )
            ) {

                return entity;

            }

        }

    }

    return null;

}

/**
 * ==================================================
 * EXPORTS
 * ==================================================
 */
module.exports = {

    hasCache,

    getCache,

    setCache,

    getEntityCache,

    clearCache,

    clearAllCaches,

    getCacheInfo,

    debugCache,

    findEntity

};