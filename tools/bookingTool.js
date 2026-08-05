const { executeStoredProcedure } = require("./baseTool");

async function getTodayBookings(context) {

    return executeStoredProcedure({

        toolName: "getTodayBookings",

        context

    });

}

module.exports = {
    getTodayBookings
};