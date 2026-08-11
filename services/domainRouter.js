/**
 * ==================================================
 * AI DOMAIN ROUTER
 * ==================================================
 *
 * Detects the business domain and action from
 * the employee's message.
 *
 * Uses:
 *
 * config/businessDomains.js
 *
 * Domains:
 *
 * vehicle
 * sales
 * finance
 * CRM
 *
 */

const businessDomains =
    require("../config/businessDomains");


/**
 * ==================================================
 * Normalize
 * ==================================================
 */
function normalizeText(value) {

    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^\w\s.-]/g, " ")
        .replace(/\s+/g, " ");

}


/**
 * ==================================================
 * Escape RegExp
 * ==================================================
 */
function escapeRegExp(value) {

    return String(value || "")
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

}


/**
 * ==================================================
 * Keyword Match
 * ==================================================
 *
 * Uses word/phrase boundaries.
 *
 * This prevents:
 *
 * "fearless"
 *
 * from automatically becoming a vehicle
 * query merely because FEARLESS exists in
 * the entity cache.
 *
 */
function keywordMatches(
    text,
    keyword
) {

    const normalizedKeyword =
        normalizeText(keyword);

    if (!normalizedKeyword)
        return false;

    const pattern =
        new RegExp(
            `(^|\\s)${escapeRegExp(normalizedKeyword)}(\\s|$)`,
            "i"
        );

    return pattern.test(text);

}


/**
 * ==================================================
 * Detect Domain
 * ==================================================
 */
function detectDomain(message) {

    const text =
        normalizeText(message);

    if (!text) {

        return {

            found: false,

            domain: null,

            action: null

        };

    }

    const domainResults = [];


    //--------------------------------------------------
    // Check every configured domain
    //--------------------------------------------------

    for (
        const [domainName, domainConfig]
        of Object.entries(businessDomains)
    ) {

        if (
            domainConfig?.enabled === false
        ) {

            continue;

        }

        let domainScore = 0;

        //--------------------------------------------------
        // Domain keywords
        //--------------------------------------------------

        for (
            const keyword
            of (domainConfig.keywords || [])
        ) {

            if (
                keywordMatches(
                    text,
                    keyword
                )
            ) {

                domainScore +=
                    keyword.trim().includes(" ")
                        ? 3
                        : 2;

            }

        }


        //--------------------------------------------------
        // Actions
        //--------------------------------------------------

        const actionResults = [];

        for (
            const [actionName, actionConfig]
            of Object.entries(
                domainConfig.actions || {}
            )
        ) {

            if (
                actionConfig?.enabled === false
            ) {

                continue;

            }

            let actionScore = 0;

            for (
                const keyword
                of (actionConfig.keywords || [])
            ) {

                if (
                    keywordMatches(
                        text,
                        keyword
                    )
                ) {

                    actionScore +=
                        keyword.trim().includes(" ")
                            ? 4
                            : 3;

                }

            }

            if (actionScore > 0) {

                actionResults.push({

                    action:
                        actionName,

                    score:
                        actionScore

                });

            }

        }


        //--------------------------------------------------
        // Only consider domains with a business
        // keyword OR action keyword.
        //--------------------------------------------------

        if (
            domainScore > 0 ||
            actionResults.length > 0
        ) {

            actionResults.sort(
                (a, b) =>
                    b.score - a.score
            );

            const bestAction =
                actionResults[0] || null;

            domainResults.push({

                domain:
                    domainName,

                score:
                    domainScore +
                    (bestAction?.score || 0),

                action:
                    bestAction?.action || null

            });

        }

    }


    //--------------------------------------------------
    // No business domain detected
    //--------------------------------------------------

    if (
        domainResults.length === 0
    ) {

        console.log("--------------------------------------");
        console.log("DOMAIN ROUTER");
        console.log("Message :", message);
        console.log("Result  : GENERAL AI");
        console.log("--------------------------------------");

        return {

            found: false,

            domain: null,

            action: null

        };

    }


    //--------------------------------------------------
    // Sort domains
    //--------------------------------------------------

    domainResults.sort(
        (a, b) =>
            b.score - a.score
    );


    const best =
        domainResults[0];


    //--------------------------------------------------
    // Logging
    //--------------------------------------------------

    console.log("--------------------------------------");
    console.log("DOMAIN ROUTER");
    console.log("Message :", message);
    console.log("Domain  :", best.domain);
    console.log("Action  :", best.action);
    console.log("Score   :", best.score);
    console.log("--------------------------------------");


    return {

        found: true,

        domain:
            best.domain,

        action:
            best.action,

        score:
            best.score

    };

}


module.exports = {

    detectDomain

};