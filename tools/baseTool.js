const sql = require("mssql");
const { getPool } = require("../config/db");
const { checkPermission } = require("../services/permissionManager");
const toolConfig = require("../config/toolConfig");

/**
 * Detect SQL datatype automatically
 */
function detectSqlType(value) {

    if (value === null || value === undefined)
        return sql.NVarChar;

    if (typeof value === "string")
        return sql.NVarChar(sql.MAX);

    if (typeof value === "number")
        return Number.isInteger(value)
            ? sql.Int
            : sql.Decimal(18, 2);

    if (typeof value === "boolean")
        return sql.Bit;

    if (value instanceof Date)
        return sql.DateTime;

    if (Buffer.isBuffer(value))
        return sql.VarBinary(sql.MAX);

    return sql.NVarChar(sql.MAX);
}

/**
 * Resolve parameter values
 */
function resolveContextParameter(parameter, context) {

    switch (parameter) {

        case "BranchUnq":
            return context.dealership.branchUnq;

        case "UserId":
            return context.identity.userId;

        case "PropertyCode":
            return context.dealership.propertyCode;

        case "ClientId":
            return context.dealership.clientId;

        case "Database":
            return context.dealership.database;

        default:
            return undefined;

    }

}

/**
 * Execute Stored Procedure
 */
async function executeStoredProcedure({

    toolName,

    context,

    params = {}

}) {

    const startTime = Date.now();

    try {

        //--------------------------------------------------
        // Configuration
        //--------------------------------------------------

        const config = toolConfig[toolName];

        if (!config)
            throw new Error(`Tool '${toolName}' is not configured.`);

        //--------------------------------------------------
        // Permission
        //--------------------------------------------------

        const allowed =
            await checkPermission(toolName, context);

        if (!allowed) {

            return {

                success: false,

                error: "Permission denied."

            };

        }

        //--------------------------------------------------
        // Database
        //--------------------------------------------------

        const pool =
            await getPool(
                context.dealership.database
            );

        const request =
            pool.request();

        //--------------------------------------------------
        // Build Parameters
        //--------------------------------------------------

        const finalParams = {};

        // Always send @what if configured
        if (config.what) {

            finalParams.what = config.what;

        }

        // Only send parameters declared in toolConfig
        for (const parameter of (config.parameters || [])) {

            const value =
                resolveContextParameter(
                    parameter,
                    context
                );

            if (value !== undefined) {

                finalParams[parameter] = value;

            }

        }

        // Runtime parameters override everything
        Object.assign(finalParams, params);

        //--------------------------------------------------
        // Logging
        //--------------------------------------------------

        console.log("======================================");
        console.log("SQL PARAMETERS");
        console.log(finalParams);
        console.log("======================================");

        //--------------------------------------------------
        // Bind Parameters
        //--------------------------------------------------

        for (const [key, value] of Object.entries(finalParams)) {

            request.input(

                key,

                detectSqlType(value),

                value

            );

        }

        //--------------------------------------------------
        // Execute
        //--------------------------------------------------

        const result =
            await request.execute(
                config.procedure
            );

        console.log("RAW RECORDSET");
        console.log(JSON.stringify(result.recordset, null, 2));

        const executionTime =
            Date.now() - startTime;

        return {

            success: true,

            tool: toolName,

            what: config.what,

            data: result.recordset || [],

            recordsets: result.recordsets || [],

            output: result.output || {},

            rowsAffected: result.rowsAffected || [],

            total:
                result.recordset?.length || 0,

            executionTime

        };

    }

    catch (err) {

        return {

            success: false,

            error: "Unable to retrieve data.",

            internalError: err.message,

            executionTime:
                Date.now() - startTime

        };

    }

}

module.exports = {
    executeStoredProcedure
};