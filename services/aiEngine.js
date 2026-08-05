const ai = require("../providers/aiProvider");

const { routeMessage } = require("./aiRouter");

const { analyzeDashboard } = require("./dashboardAnalyzer");

const SYSTEM_PROMPT =
    require("../prompts/systemPrompt");

/**
 * Main AI Entry
 */
async function runAI(message, aiContext) {

    console.log("======================================");
    console.log("USER QUESTION");
    console.log(message);
    console.log("======================================");

    //--------------------------------------------------
    // Route Message
    //--------------------------------------------------

    const routed =
        await routeMessage(
            message,
            aiContext
        );

    console.log("======================================");
    console.log("ROUTER RESULT");
    console.log(JSON.stringify(routed, null, 2));
    console.log("======================================");

    //--------------------------------------------------
    // Router Handled
    //--------------------------------------------------

    if (routed?.handled) {

        //--------------------------------------------------
        // Tool Error
        //--------------------------------------------------

        if (!routed.data.success) {

            return routed.data.error;

        }

        //--------------------------------------------------
        // Dashboard Summary
        //--------------------------------------------------

        if (routed.summary) {

            return await analyzeDashboard(

                routed.data.dashboard

            );

        }

        //--------------------------------------------------
        // Scalar Tool
        //--------------------------------------------------

        switch (routed.type) {

            case "bookingCount":

                return `There are ${routed.data.value} bookings.`;

            case "saleCount":

                return `There are ${routed.data.value} sales.`;

            case "bookingAmount":

                return `Today's booking amount is ₹${Number(

                    routed.data.value

                ).toLocaleString("en-IN")}.`;

            case "saleAmount":

                return `Today's sales amount is ₹${Number(

                    routed.data.value

                ).toLocaleString("en-IN")}.`;

            case "pendingDelivery":

                return `There are ${routed.data.value} pending deliveries.`;

            default:

                if (

                    routed.data.value !== undefined &&

                    routed.data.value !== null

                ) {

                    return routed.data.value.toString();

                }

                return "Done.";

        }

    }

    //--------------------------------------------------
    // General AI Conversation
    //--------------------------------------------------

    const prompt = `
${SYSTEM_PROMPT}

You are MyAutoShop AI.

Employee Question:

${message}

Reply professionally.

If the employee is asking about dealership KPIs that are not currently supported,
politely explain that the feature is not available yet.
`;

    const reply =
        await ai.generate(prompt);

    return reply;

}

module.exports = {

    runAI

};