const { executeTool } = require("./genericTool");

/**
 * Executes multiple tools and combines the results.
 *
 * @param {Array<string>} toolNames
 * @param {Object} context
 * @returns {Object}
 */
async function executeCompositeTool(toolNames, context) {

    const dashboard = {};

    const errors = [];

    for (const toolName of toolNames) {

        try {

            console.log("------------------------------------------");
            console.log("Executing :", toolName);
            console.log("------------------------------------------");

            const result =
                await executeTool(
                    toolName,
                    context
                );

            if (!result.success) {

                errors.push({

                    tool: toolName,

                    error: result.error

                });

                continue;

            }

            //--------------------------------------------------
            // Remove get prefix
            //--------------------------------------------------

            const key =
                toolName.replace(/^get/, "");

            dashboard[
                key.charAt(0).toLowerCase() +
                key.slice(1)
            ] = result.value;

        }

        catch (err) {

            errors.push({

                tool: toolName,

                error: err.message

            });

        }

    }

    return {

        success: errors.length === 0,

        dashboard,

        errors

    };

}

module.exports = {

    executeCompositeTool

};