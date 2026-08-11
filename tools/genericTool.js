const {
    executeStoredProcedure
} = require("./baseTool");

/**
 * ==================================================
 * Generic Tool Executor
 * ==================================================
 *
 * Executes a configured tool from toolConfig.js.
 *
 * Flow:
 *
 * AI
 *   ↓
 * executeTool()
 *   ↓
 * baseTool.js
 *   ↓
 * SQL Stored Procedure
 *
 */

async function executeTool(

    toolName,

    context,

    params = {}

) {

    const result =
        await executeStoredProcedure({

            toolName,

            context,

            params

        });

    //--------------------------------------------------
    // Failed
    //--------------------------------------------------

    if (!result.success) {

        return result;

    }

    //--------------------------------------------------
    // Scalar Response
    //--------------------------------------------------

    let value = null;

    if (

        Array.isArray(result.data) &&

        result.data.length > 0

    ) {

        const row =
            result.data[0];

        value =
            Object.values(row)[0];

    }

    return {

        success: true,

        tool: toolName,

        value,

        data: result.data,

        total: result.total,

        executionTime:
            result.executionTime

    };

}

module.exports = {

    executeTool

};