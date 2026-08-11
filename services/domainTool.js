const businessDomains =
    require("../config/businessDomains");

const {
    executeStoredProcedure
} = require("../tools/baseTool");

/**
 * ==================================================
 * Generic Domain Tool
 * ==================================================
 *
 * Vehicle
 * Sales
 * Finance
 * CRM
 *
 * All business domains use this executor.
 *
 */
async function executeDomainTool({

    domain,

    action,

    context,

    filters = {}

}) {

    //--------------------------------------------------
    // Domain Exists
    //--------------------------------------------------

    const domainConfig =
        businessDomains[domain];

    if (!domainConfig) {

        return {

            success: false,

            error: `Unknown domain '${domain}'.`

        };

    }

    //--------------------------------------------------
    // Action Exists
    //--------------------------------------------------

    const actionConfig =
        domainConfig.actions?.[action];

    if (!actionConfig) {

        return {

            success: false,

            error:
                `Unknown action '${action}' in domain '${domain}'.`

        };

    }

    //--------------------------------------------------
    // Build Tool Configuration
    //--------------------------------------------------

    const toolConfig = {

        procedure:
            "A_SP_FOR_ApplicationChallangrid",

        what:
            actionConfig.what,

        permission:
            actionConfig.permission,

        responseType:
            actionConfig.responseType || "table",

        parameters:
            actionConfig.parameters || [],

        contextParameters:
            actionConfig.contextParameters || []

    };

    //--------------------------------------------------
    // Logging
    //--------------------------------------------------

    console.log("======================================");
    console.log("DOMAIN TOOL");
    console.log("--------------------------------------");
    console.log("Domain      :", domain);
    console.log("Action      :", action);
    console.log("Procedure   :", toolConfig.procedure);
    console.log("What        :", toolConfig.what);
    console.log("Filters");
    console.table(filters);
    console.log("======================================");

    //--------------------------------------------------
    // Execute Stored Procedure
    //--------------------------------------------------

    const result =
        await executeStoredProcedure({

            toolConfig,

            context,

            params: filters

        });

    //--------------------------------------------------
    // Return
    //--------------------------------------------------

    return {

        domain,

        action,

        ...result

    };

}

module.exports = {

    executeDomainTool

};