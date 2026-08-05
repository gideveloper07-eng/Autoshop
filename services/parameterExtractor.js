const { entityCache } = require("./entityCache");
const { parseDate } =
    require("./dateParser");
/**
 * Finds the first matching entity from cache.
 */
function findEntity(text, values) {

    if (!Array.isArray(values))
        return null;

    const lowerText = text.toLowerCase();

    for (const value of values) {

        if (!value)
            continue;

        if (lowerText.includes(value.toLowerCase())) {

            return value;

        }

    }

    return null;

}

/**
 * Extract all supported parameters from the message.
 */
function extractParameters(message) {

    const text = message.toLowerCase();

    const params = {};

    //--------------------------------------------------
    // Branch
    //--------------------------------------------------

    const branch =
        findEntity(
            text,
            entityCache.branches
        );

    if (branch) {

        params.branch = branch;

    }

    //--------------------------------------------------
    // Vehicle Model
    //--------------------------------------------------

    const model =
        findEntity(
            text,
            entityCache.models
        );

    if (model) {

        params.model = model;

    }

    //--------------------------------------------------
    // Sales Executive
    //--------------------------------------------------

    const executive =
        findEntity(
            text,
            entityCache.executives
        );

    if (executive) {

        params.executive = executive;

    }

    //--------------------------------------------------
    // Workshop
    //--------------------------------------------------

    const workshop =
        findEntity(
            text,
            entityCache.workshops
        );

    if (workshop) {

        params.workshop = workshop;

    }

    //--------------------------------------------------
    // Finance Company
    //--------------------------------------------------

    const financeCompany =
        findEntity(
            text,
            entityCache.financeCompanies
        );

    if (financeCompany) {

        params.financeCompany =
            financeCompany;

    }

    //--------------------------------------------------
    // Customer
    //--------------------------------------------------

    const customer =
        findEntity(
            text,
            entityCache.customers
        );

    if (customer) {

        params.customer = customer;

    }

    //--------------------------------------------------
    // Vendor
    //--------------------------------------------------

    const vendor =
        findEntity(
            text,
            entityCache.vendors
        );

    if (vendor) {

        params.vendor = vendor;

    }
//--------------------------------------------------
// Date Parameters
//--------------------------------------------------

Object.assign(

    params,

    parseDate(message)

);
    return params;

}

module.exports = {

    extractParameters

};