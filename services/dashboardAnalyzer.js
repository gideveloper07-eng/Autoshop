const ai = require("../providers/aiProvider");

const {
    buildBusinessSummaryPrompt
} = require("../prompts/businessSummaryPrompt");

async function analyzeDashboard(dashboard) {

    const prompt =
        buildBusinessSummaryPrompt(
            dashboard
        );

    return await ai.generate(prompt);

}

module.exports = {

    analyzeDashboard

};