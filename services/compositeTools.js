const { getDashboardSummary } = require("../tools/dashboardSummaryTool");

module.exports = {

    getDashboardSummary: {

        description:
            "Returns today's dealership business summary.",

        function: (context) =>
            getDashboardSummary(context),

        declaration: {

            name: "getDashboardSummary",

            description:
                "Returns today's dealership business summary.",

            parametersJsonSchema: {

                type: "object",

                properties: {}

            }

        }

    }

};