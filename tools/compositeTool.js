const { executeTool } = require("./genericTool");

/**
 * ==================================================
 * Composite Tool Executor
 * ==================================================
 *
 * Executes multiple tools and combines the results
 * into a single dashboard object.
 *
 */

async function executeCompositeTool(

    toolNames,

    context,

    params = {}

) {

    const dashboard = {};

    const errors = [];

    for (const toolName of toolNames) {

        try {

            console.log("------------------------------------------");
            console.log("Executing :", toolName);
            console.log("------------------------------------------");

            const result = await executeTool(

                toolName,

                context,

                params

            );

            //--------------------------------------------------
            // Tool Failed
            //--------------------------------------------------

            if (!result.success) {

                console.log("======================================");
                console.log("TOOL FAILED");
                console.log(result);
                console.log("======================================");

                errors.push({

                    tool: toolName,

                    error: result.error,

                    internalError: result.internalError

                });

                continue;

            }

            //--------------------------------------------------
            // Convert Tool Name -> Dashboard Key
            //--------------------------------------------------

            const key =
                toolName.replace(/^get/, "");

            const dashboardKey =
                key.charAt(0).toLowerCase() +
                key.slice(1);

            //--------------------------------------------------
            // Scalar Result
            //--------------------------------------------------

            if (

                Array.isArray(result.data) &&

                result.data.length > 0

            ) {

                const row =
                    result.data[0];

                dashboard[dashboardKey] =
                    Object.values(row)[0];

            }
            else {

                dashboard[dashboardKey] = null;

            }

        }

        catch (err) {

            console.log(err);

            errors.push({

                tool: toolName,

                error: err.message

            });

        }

    }

    console.log("======================================");
    console.log("COMPOSITE DASHBOARD");
    console.log(JSON.stringify(dashboard, null, 2));
    console.log("======================================");

    return {

        success: errors.length === 0,

        dashboard,

        errors

    };

}

module.exports = {

    executeCompositeTool

};