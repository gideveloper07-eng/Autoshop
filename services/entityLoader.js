const { getPool } = require("../config/db");

const {

    entityCache,

    markInitialized

} = require("./entityCache");

/**
 * Executes a query and returns
 * first column as string array.
 */
async function loadEntity(query) {

    try {

        const pool =
    await getPool();
        const result =
            await pool.request().query(query);

        if (!result.recordset)
            return [];

        return result.recordset.map(row =>
            Object.values(row)[0]
        );

    }

    catch (err) {

        console.error(err);

        return [];

    }

}

/**
 * Load every entity used by AI.
 */
async function initializeEntityCache() {

    console.log("--------------------------------------");
    console.log("Loading AI Entity Cache...");
    console.log("--------------------------------------");

    entityCache.branches =
        await loadEntity(`
            SELECT BranchName
            FROM BranchMaster
        `);

    entityCache.models =
        await loadEntity(`
            SELECT ModelName
            FROM VehicleModelMaster
        `);

    entityCache.executives =
        await loadEntity(`
            SELECT ExecutiveName
            FROM SalesExecutiveMaster
        `);

    entityCache.workshops =
        await loadEntity(`
            SELECT WorkshopName
            FROM WorkshopMaster
        `);

    entityCache.financeCompanies =
        await loadEntity(`
            SELECT FinanceName
            FROM FinanceCompanyMaster
        `);

   markInitialized();

console.log("--------------------------------------");
console.log("AI Entity Cache Loaded");
console.log("--------------------------------------");
console.log(entityCache);
console.log("--------------------------------------");

}

module.exports = {

    initializeEntityCache

};