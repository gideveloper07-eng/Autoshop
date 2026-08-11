const ai = require("../providers/aiProvider");

const { routeMessage } = require("./aiRouter");

const SYSTEM_PROMPT =
    require("../prompts/systemPrompt");

const { analyzeDashboard } =
    require("./dashboardAnalyzer");


/**
 * ==================================================
 * Main AI Engine
 * ==================================================
 */
async function runAI(
    message,
    aiContext
) {

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

    console.log(
        JSON.stringify(
            routed,
            null,
            2
        )
    );

    console.log("======================================");


    //--------------------------------------------------
    // Router Handled
    //--------------------------------------------------

    if (routed?.handled) {


        //--------------------------------------------------
        // MODEL SELECTION REQUIRED
        //--------------------------------------------------

        if (routed.selectionRequired) {

            return (
                routed.message ||
                "Please choose one of the available options."
            );
        }


        //--------------------------------------------------
        // ENTITY CLARIFICATION
        //--------------------------------------------------

        if (routed.clarification) {

            return (
                routed.data?.message ||
                routed.message ||
                "Please choose one of the matching entities."
            );
        }


        //--------------------------------------------------
        // Tool Error
        //--------------------------------------------------

        if (
            routed.data &&
            routed.data.success === false
        ) {

            return (
                routed.data.error ||
                "Unable to retrieve the requested data."
            );
        }


        //--------------------------------------------------
        // Dashboard Summary
        //--------------------------------------------------

        if (routed.summary) {

            return await analyzeDashboard(
                routed.data?.dashboard
            );
        }


        //--------------------------------------------------
        // SALES + EXECUTIVE PERFORMANCE FORMATTING
        //--------------------------------------------------
        //
        // Handles:
        //
        // sale
        // yesterdaySale
        // salesComparison
        // salesTrend
        // executivePerformance
        //
        //--------------------------------------------------

        if (
            routed.type === "sales" &&
            [
                "sale",
                "yesterdaySale",
                "salesComparison",
                "salesTrend",
                "executivePerformance"
            ].includes(
                routed.action
            ) &&
            Array.isArray(
                routed.data?.data
            )
        ) {


            //--------------------------------------------------
            // EXECUTIVE PERFORMANCE
            //--------------------------------------------------

            if (
                routed.action ===
                "executivePerformance"
            ) {

                const executivePrompt = `
${SYSTEM_PROMPT}

You are MyAutoShop AI, a dealership
business intelligence assistant.

Employee asked:

"${message}"

Business domain:

sales

Action:

executivePerformance


The business system returned the following
executive performance data:

${JSON.stringify(
    routed.data.data,
    null,
    2
)}


==================================================
IMPORTANT DATA RULES
==================================================

- Use ONLY the supplied data.
- Never invent an executive name.
- Never invent a booking count.
- Never invent a sales count.
- Never invent a sales value.
- A value of 0 means zero activity.
- A value of 0 does NOT mean data is unavailable.
- If a requested value is absent, say "Not available".
- Do not calculate conversion rate.
- Do not invent a conversion rate.
- Do not compare bookings and sales as a conversion
  percentage.
- Do not invent targets.
- Do not invent rankings that are not supported by
  the supplied data.
- Do not invent reasons for good or bad performance.
- Do not mention SQL.
- Do not mention JSON.
- Do not mention stored procedures.
- Do not mention APIs.
- Do not mention routing.
- Do not mention tools.
- Do not mention database field names.
- Do not expose internal implementation details.


==================================================
MARKDOWN FORMATTING
==================================================

MARKDOWN FORMATTING IS MANDATORY.

- ALWAYS return Markdown.
- ALWAYS use a short heading.
- ALWAYS use bullet points for executive KPIs.
- ALWAYS make executive names **bold**.
- ALWAYS make important numeric values **bold**.
- ALWAYS make sales values **bold**.
- ALWAYS make sales counts **bold**.
- ALWAYS make booking counts **bold**.
- Keep the response concise.
- Optimize the response for a mobile chat screen.
- Do NOT create a large Markdown table.
- Use ₹ for Indian currency.
- Use lakh/crore notation for large Indian amounts
  when appropriate.
- Do not change the actual meaning of the supplied
  amount.


==================================================
EXPECTED FORMAT
==================================================

For a request such as:

"Show executive performance this month"

use:

### 📊 Sales Executive Performance

**This Month**

- **Executive Name**
  - 🚗 **Sales:** **X**
  - 💰 **Sales Value:** **₹X**
  - 📋 **Bookings:** **X**

For multiple executives, repeat the same format.

Example:

- **DIVYA SONI PN**
  - 🚗 **Sales:** **3**
  - 💰 **Sales Value:** **₹53.40 lakh**
  - 📋 **Bookings:** **1**

- **VISHNU PRAKASH GAUR BGKT**
  - 🚗 **Sales:** **2**
  - 💰 **Sales Value:** **₹50.46 lakh**
  - 📋 **Bookings:** **4**


==================================================
OVERALL PERFORMANCE
==================================================

After listing executives, provide an overall summary
when multiple rows are available.

Use:

### 📈 Overall Performance

- **Total sales:** **X vehicles**
- **Total sales value:** **₹X**
- **Total bookings:** **X**

Calculate totals ONLY from the supplied rows.

Do not calculate or display a total if the required
data is missing.


==================================================
ORDERING
==================================================

If multiple executives are supplied:

- Prefer the supplied database order.
- Do NOT reorder executives unless the employee
  explicitly asks for ranking.
- If the employee asks "top", "highest", "best",
  or "who sold the most", then ranking may be
  performed using the supplied sales values/counts.


==================================================
NO DATA
==================================================

If the supplied data contains no rows, return:

### 📊 Sales Executive Performance

**No executive performance records were found for
the requested period.**


==================================================
MISSING DATA
==================================================

If an executive has:

BookingCount = 0

show:

- 📋 **Bookings:** **0**

Do NOT say that booking information is unavailable.

If SaleCount = 0:

- 🚗 **Sales:** **0**

Do NOT say that sales information is unavailable.

Only use "Not available" when the actual value is
missing from the supplied data.


==================================================
IMPORTANT
==================================================

Do not add recommendations unless the employee
explicitly asks for recommendations.

Do not create business conclusions that are not
supported by the supplied data.
`;


                const response =
                    await ai.generate(
                        executivePrompt
                    );


                console.log(
                    "======================================"
                );

                console.log(
                    "FINAL EXECUTIVE PERFORMANCE AI RESPONSE"
                );

                console.log(
                    response
                );

                console.log(
                    "======================================"
                );


                return response;
            }


            //--------------------------------------------------
            // NORMAL SALES PERFORMANCE
            //--------------------------------------------------

            const salesPrompt = `
${SYSTEM_PROMPT}

You are MyAutoShop AI, a dealership business
intelligence assistant.

Employee asked:

"${message}"

Business domain: sales

Action: ${routed.action}

The business system returned this factual
sales data:

${JSON.stringify(
    routed.data.data,
    null,
    2
)}


==================================================
IMPORTANT DATA RULES
==================================================

- Use ONLY the supplied data.
- Never invent a sales count.
- Never invent a sales amount.
- Never invent a date.
- Never invent a model.
- Never invent a percentage.
- A value of 0 means zero sales.
- A value of 0 does NOT mean data is unavailable.
- If a requested value is absent from the data,
  say "Not available".
- Do not mention SQL.
- Do not mention JSON.
- Do not mention stored procedures.
- Do not mention routing.
- Do not mention tools.
- Do not mention APIs.
- Do not mention internal implementation.
- Do not expose database field names.


==================================================
MARKDOWN FORMATTING
==================================================

MARKDOWN FORMATTING IS MANDATORY.

- ALWAYS return Markdown.
- ALWAYS use a short heading.
- ALWAYS use bullet points when presenting
  multiple KPIs.
- ALWAYS make KPI labels bold.
- ALWAYS make important numeric values bold.
- ALWAYS make sales amounts bold when supplied.
- ALWAYS make percentages bold when supplied.
- ALWAYS make model names bold when supplied.
- ALWAYS make important conclusions bold
  where appropriate.
- Keep the response concise.
- Optimize for a mobile chat screen.
- Do not create a large table unless the employee
  explicitly asks for one.


==================================================
SIMPLE SALES PERIOD
==================================================

For a simple sales-period question, use:

### 📊 Sales Summary

- **Vehicles sold:** **X**
- **Sales value:** **₹X**
- **Period:** **X**

Only show Sales value when it is supplied.


==================================================
SALES COMPARISON
==================================================

For comparisons, use:

### 📈 Sales Performance

- **Today:** **X vehicles** — **₹X**
- **Yesterday:** **X vehicles** — **₹X**
- **Difference:** **X vehicles**
- **Growth:** **X%**

Then provide a short conclusion.

For improving:

**Sales are improving compared with the previous
period.**

For declining:

**Sales are declining compared with the previous
period.**

For stable:

**Sales are stable compared with the previous
period.**


==================================================
SALES TREND
==================================================

For trend questions:

- Clearly state **Improving** 📈,
  **Declining** 📉, or **Stable** ➡️.
- Base the conclusion ONLY on the supplied result.
- Never invent a reason for the trend.


==================================================
NO DATA
==================================================

If there is no data:

**No sales records were found for the requested
period.**


==================================================
MISSING VALUE
==================================================

If a value is missing:

- Do not guess it.
- Say **Not available**.

Never return a plain paragraph when multiple
data fields are available.
`;


            const response =
                await ai.generate(
                    salesPrompt
                );


            console.log(
                "======================================"
            );

            console.log(
                "FINAL SALES AI RESPONSE"
            );

            console.log(
                response
            );

            console.log(
                "======================================"
            );


            return response;
        }


        //--------------------------------------------------
        // Scalar Result
        //--------------------------------------------------

        const scalarActions = [
            "stock"
        ];


        if (
            scalarActions.includes(
                routed.action
            ) &&
            Array.isArray(
                routed.data?.data
            ) &&
            routed.data.data.length === 1
        ) {

            const row =
                routed.data.data[0];

            const values =
                Object.values(row);


            if (
                values.length === 1
            ) {

                return String(
                    values[0]
                );
            }
        }


        //--------------------------------------------------
        // Table Result
        //--------------------------------------------------

        if (
            Array.isArray(
                routed.data?.data
            )
        ) {

            const prompt = `
${SYSTEM_PROMPT}

You are MyAutoShop AI.

Employee asked:

"${message}"


Business Domain:

${routed.type}


Action:

${routed.action}


The business system returned:

${JSON.stringify(
    routed.data.data,
    null,
    2
)}


==================================================
INSTRUCTIONS
==================================================

- Use ONLY the supplied data.
- Summarize the result naturally.
- Use Markdown formatting.
- ALWAYS use a short heading.
- Use **bold** for important numbers.
- Use **bold** for model names.
- Use **bold** for totals.
- Use **bold** for warnings.
- Use **bold** for key conclusions.
- Use bullet points for lists of models or items.
- Use short headings when useful.
- Keep the response concise.
- Keep the response easy to scan on a mobile screen.
- Do not create large tables unless the user
  explicitly asks for a table.
- Mention totals where appropriate.
- If there are multiple rows, provide a concise
  overview followed by bullet points.
- Never mention SQL.
- Never mention JSON.
- Never mention stored procedures.
- Never mention APIs.
- Never mention routing.
- Never mention tools.
- Never mention internal implementation.
- Never expose database field names.
- If there is no data, politely state that no
  records were found.
- Never invent information that is not present
  in the supplied data.
`;


            const response =
                await ai.generate(
                    prompt
                );


            console.log(
                "======================================"
            );

            console.log(
                "FINAL TABLE AI RESPONSE"
            );

            console.log(
                response
            );

            console.log(
                "======================================"
            );


            return response;
        }


        //--------------------------------------------------
        // Fallback
        //--------------------------------------------------

        return "Task completed.";
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

Use Markdown when it improves readability.

Use:

- **bold** for important information
- bullet points for lists
- short headings for longer answers

If the employee asks about a feature that has
not yet been implemented, politely explain that
it is not currently available.
`;


    const response =
        await ai.generate(
            prompt
        );


    console.log(
        "======================================"
    );

    console.log(
        "FINAL GENERAL AI RESPONSE"
    );

    console.log(
        response
    );

    console.log(
        "======================================"
    );


    return response;
}


/**
 * ==================================================
 * Exports
 * ==================================================
 */

module.exports = {
    runAI
};