/**
 * ==================================================
 * Intent Matcher
 * ==================================================
 *
 * Matches a user message against the configured
 * intent patterns.
 *
 */

function matchIntent(message, intentConfig) {

    const text =
        (message || "")
            .toLowerCase()
            .trim();

    //--------------------------------------------------
    // Search Every Intent
    //--------------------------------------------------

    for (const intent of intentConfig) {

        if (!Array.isArray(intent.patterns))
            continue;

        //--------------------------------------------------
        // Search Every Pattern
        //--------------------------------------------------

        for (const pattern of intent.patterns) {

            const matched =
                pattern.every(word =>

                    text.includes(
                        word.toLowerCase()
                    )

                );

            if (!matched)
                continue;

            console.log("--------------------------------------");
            console.log("MATCHED INTENT :", intent.type);
            console.log("PATTERN :", pattern.join(" "));
            console.log("--------------------------------------");

            return {

                type: intent.type,

                tool: intent.tool || null,

                tools: intent.tools || null,

                summary: intent.summary || false

            };

        }

    }

    //--------------------------------------------------
    // No Match
    //--------------------------------------------------

    console.log("--------------------------------------");
    console.log("NO INTENT MATCHED");
    console.log(text);
    console.log("--------------------------------------");

    return null;

}

module.exports = {

    matchIntent

};