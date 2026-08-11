const sql = require("mssql");

const toolConfigs =
    require("../config/toolConfig");

const { getPool } =
    require("../config/db");

const {
    checkPermission
} = require("../services/permissionManager");

/**
 * Detect SQL datatype automatically.
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
 * Resolve built-in context parameters.
 */
function resolveContextParameters(context) {

    return {

        BranchUnq:
            context?.dealership?.branchUnq,

        PropertyCode:
            context?.dealership?.propertyCode,

        Database:
            context?.dealership?.database,

        ClientId:
            context?.dealership?.clientId,

        UserId:
            context?.identity?.userId,

        UserCode:
            context?.identity?.userCode,

        LoginName:
            context?.identity?.userName,

        EmployeeId:
            context?.identity?.employeeId

    };

}

/**
 * Execute Stored Procedure.
 */
async function executeStoredProcedure({

    toolName = null,

    toolConfig = null,

    context,

    params = {}

}) {

    const startTime = Date.now();

    let config = null;

    let procedure =
        "A_SP_FOR_ApplicationChallangrid";

    try {

        //--------------------------------------------------
        // Configuration
        //--------------------------------------------------

        config =
            toolConfig ||
            toolConfigs[toolName];

        if (!config) {

            throw new Error(
                "Tool configuration not found."
            );

        }

        if (config.procedure) {

            procedure =
                config.procedure;

        }

        //--------------------------------------------------
        // Permission
        //--------------------------------------------------

        if (config.permission) {

            const allowed =
                await checkPermission(

                    config.permission,

                    context

                );

            if (!allowed) {

                return {

                    success: false,

                    error: "Permission denied."

                };

            }

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

        const contextParams =
            resolveContextParameters(context);

        // @what

        if (config.what) {

            finalParams.what =
                config.what;

        }

        // Context Parameters

        for (

            const parameter of

            (config.contextParameters || [])

        ) {

            if (

                contextParams[parameter] !== undefined

            ) {

                finalParams[parameter] =
                    contextParams[parameter];

            }

        }

        // AI Parameters

        for (

            const parameter of

            (config.parameters || [])

        ) {

            if (

                params[parameter] !== undefined

            ) {

                finalParams[parameter] =
                    params[parameter];

            }

        }

        //--------------------------------------------------
        // Remove Undefined
        //--------------------------------------------------

        Object.keys(finalParams)
            .forEach(key => {

                if (

                    finalParams[key] === undefined ||

                    finalParams[key] === null

                ) {

                    delete finalParams[key];

                }

            });

        //--------------------------------------------------
        // Logging
        //--------------------------------------------------

        console.log("======================================");
        console.log("DATABASE   :", context.dealership.database);
        console.log("PROCEDURE  :", procedure);
        console.log("WHAT       :", config.what);
        console.log("PERMISSION :", config.permission);
        console.log("PARAMETERS");
        console.table(finalParams);
        console.log("======================================");

        //--------------------------------------------------
        // Bind Parameters
        //--------------------------------------------------

        for (

            const [key, value]

            of Object.entries(finalParams)

        ) {

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
                procedure
            );

        const executionTime =
            Date.now() - startTime;

        return {

            success: true,

            procedure,

            what: config.what,

            permission: config.permission,

            parameters: finalParams,

            data:
                result.recordset || [],

            recordsets:
                result.recordsets || [],

            output:
                result.output || {},

            rowsAffected:
                result.rowsAffected || [],

            total:
                result.recordset?.length || 0,

            executionTime

        };

    }

    catch (err) {

        console.log("======================================");
        console.log("SQL EXECUTION FAILED");
        console.log("DATABASE :", context?.dealership?.database);
        console.log("PROCEDURE:", procedure);
        console.log("WHAT     :", config?.what);
        console.log(err.message);
        console.log("======================================");

        return {

            success: false,

            procedure,

            what: config?.what,

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