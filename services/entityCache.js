/**
 * In-memory cache of dealership master data.
 *
 * This cache is populated once during server startup
 * by entityLoader.js and is read by the AI services.
 */

const entityCache = {

    //--------------------------------------------------
    // Dealership Master Data
    //--------------------------------------------------

    branches: [],

    models: [],

    executives: [],

    workshops: [],

    financeCompanies: [],

    customers: [],

    vendors: [],

    //--------------------------------------------------
    // Cache Information
    //--------------------------------------------------

    initialized: false,

    loadedAt: null

};

/**
 * Mark cache as initialized.
 */
function markInitialized() {

    entityCache.initialized = true;

    entityCache.loadedAt = new Date();

}

/**
 * Clears cache.
 */
function clearCache() {

    entityCache.branches = [];

    entityCache.models = [];

    entityCache.executives = [];

    entityCache.workshops = [];

    entityCache.financeCompanies = [];

    entityCache.customers = [];

    entityCache.vendors = [];

    entityCache.initialized = false;

    entityCache.loadedAt = null;

}

/**
 * Returns current cache status.
 */
function getStatus() {

    return {

        initialized: entityCache.initialized,

        loadedAt: entityCache.loadedAt,

        branches: entityCache.branches.length,

        models: entityCache.models.length,

        executives: entityCache.executives.length,

        workshops: entityCache.workshops.length,

        financeCompanies: entityCache.financeCompanies.length,

        customers: entityCache.customers.length,

        vendors: entityCache.vendors.length

    };

}

module.exports = {

    entityCache,

    markInitialized,

    clearCache,

    getStatus

};