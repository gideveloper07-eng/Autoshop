const { executeStoredProcedure } = require("./baseTool");
const toolConfig = require("../config/toolConfig");

async function executeTool(toolName, context, params = {}) {

    const config = toolConfig[toolName];

    if (!config) {

        return {

            success: false,

            error: `Tool '${toolName}' not configured.`

        };

    }

    const result = await executeStoredProcedure({

        toolName,

        context,

        params

    });

    if (!result.success) {

        return result;

    }

    //------------------------------------------------------
    // Scalar Response
    //------------------------------------------------------

    if (config.responseType === "scalar") {

        if (!result.data || result.data.length === 0) {

            return {

                success: true,

                value: 0

            };

        }

        const row = result.data[0];

        const key = Object.keys(row)[0];

        return {

            success: true,

            value: row[key]

        };

    }

    //------------------------------------------------------
    // Table Response
    //------------------------------------------------------

    return result;

}

module.exports = {

    executeTool

};