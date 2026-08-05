const intentConfig =
    require("../config/intentConfig");

const {
    matchIntent
} = require("./intentMatcher");

const {
    extractParameters
} = require("./parameterExtractor");

const {
    executeTool
} = require("../tools/genericTool");

const {
    executeCompositeTool
} = require("../tools/compositeTool");

const {

    getContext,

    updateContext,

    mergeParameters,

    isFollowUp

} = require("./contextManager");

/**
 * Routes employee message
 * to the correct business tool.
 */
async function routeMessage(message, context) {

    //--------------------------------------------------
    // Logged-in User
    //--------------------------------------------------

    const userId =

        context?.identity?.userId ||

        context?.identity?.userGuid ||

        "anonymous";

    //--------------------------------------------------
    // Extract Parameters
    //--------------------------------------------------

    let params =
        extractParameters(message);

    //--------------------------------------------------
    // Follow-up Conversation
    //--------------------------------------------------

    if (isFollowUp(message)) {

        params =

            mergeParameters(

                userId,

                params

            );

    }

    //--------------------------------------------------
    // Match Intent
    //--------------------------------------------------

    let intent =

        matchIntent(

            message,

            intentConfig

        );

    //--------------------------------------------------
    // Reuse Previous Intent
    //--------------------------------------------------

    if (!intent) {

        const previous =
            getContext(userId);

        if (previous.lastIntent) {

            intent = {

                type: previous.lastIntent,

                tool: previous.lastTool,

                tools: previous.lastTools,

                summary: previous.summary

            };

            console.log("Reusing previous intent:",
                previous.lastIntent);

        }

    }

    //--------------------------------------------------
    // No Intent
    //--------------------------------------------------

    if (!intent) {

        return {

            handled: false

        };

    }

    console.log("--------------------------------------");
    console.log("Matched Intent :", intent.type);
    console.log("Parameters :", params);
    console.log("--------------------------------------");

    //--------------------------------------------------
    // Composite Tool
    //--------------------------------------------------

    if (

        Array.isArray(intent.tools) &&

        intent.tools.length > 0

    ) {

        const result =

            await executeCompositeTool(

                intent.tools,

                context

            );

        updateContext(

            userId,

            {

                lastIntent: intent.type,

                lastTools: intent.tools,

                lastParams: params,

                lastQuestion: message,

                summary: true

            }

        );

        return {

            handled: true,

            type: intent.type,

            summary: true,

            params,

            data: result

        };

    }

    //--------------------------------------------------
    // Single Tool
    //--------------------------------------------------

    const result =

        await executeTool(

            intent.tool,

            context,

            params

        );

    updateContext(

        userId,

        {

            lastIntent: intent.type,

            lastTool: intent.tool,

            lastParams: params,

            lastQuestion: message,

            summary: false

        }

    );

    return {

        handled: true,

        type: intent.type,

        summary: false,

        params,

        data: result

    };

}

module.exports = {

    routeMessage

};