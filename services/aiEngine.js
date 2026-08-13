const ai = require("../providers/aiProvider");

const {
    routeMessage
} = require("./aiRouter");

const SYSTEM_PROMPT =
    require("../prompts/systemPrompt");

const {
    analyzeDashboard
} = require("./dashboardAnalyzer");


/**
 * ==================================================
 * SALES COMPARISON FORMATTER
 * ==================================================
 *
 * IMPORTANT:
 * Do NOT send SalesComparison through Gemini.
 *
 * The stored procedure already returns:
 *
 * CurrentPeriod
 * CurrentSaleCount
 * CurrentSaleValue
 * PreviousPeriod
 * PreviousSaleCount
 * PreviousSaleValue
 * SaleCountDifference
 * SaleValueDifference
 * SaleValueGrowthPercent
 *
 * We format those values directly so that:
 *
 * 0 = zero sales
 * NULL = missing value
 *
 * and never incorrectly becomes:
 *
 * "No sales data is available for comparison."
 * ==================================================
 */
function formatSalesComparison(data, message = "") {

    //--------------------------------------------------
    // Normalize result
    //--------------------------------------------------

    let row = null;

    if (Array.isArray(data)) {
        row = data[0] || null;
    }
    else if (data && typeof data === "object") {
        row = data;
    }

    //--------------------------------------------------
    // No row returned at all
    //--------------------------------------------------

    if (!row) {
        return (
            "📊 **Sales Comparison**\n\n" +
            "No comparison record was returned."
        );
    }

    //--------------------------------------------------
    // Read SQL values
    //--------------------------------------------------

    const currentPeriod =
        row.CurrentPeriod ??
        row.currentPeriod ??
        "today";

    const previousPeriod =
        row.PreviousPeriod ??
        row.previousPeriod ??
        "yesterday";

    const currentSaleCount =
        Number(
            row.CurrentSaleCount ??
            row.currentSaleCount ??
            0
        );

    const currentSaleValue =
        Number(
            row.CurrentSaleValue ??
            row.currentSaleValue ??
            0
        );

    const previousSaleCount =
        Number(
            row.PreviousSaleCount ??
            row.previousSaleCount ??
            0
        );

    const previousSaleValue =
        Number(
            row.PreviousSaleValue ??
            row.previousSaleValue ??
            0
        );

    const saleCountDifference =
        Number(
            row.SaleCountDifference ??
            row.saleCountDifference ??
            (
                currentSaleCount -
                previousSaleCount
            )
        );

    const saleValueDifference =
        Number(
            row.SaleValueDifference ??
            row.saleValueDifference ??
            (
                currentSaleValue -
                previousSaleValue
            )
        );

    //--------------------------------------------------
    // Growth
    //--------------------------------------------------

    let growth =
        row.SaleValueGrowthPercent ??
        row.saleValueGrowthPercent;

    growth = Number(growth);

    if (!Number.isFinite(growth)) {

        if (previousSaleValue === 0) {

            if (currentSaleValue > 0) {
                growth = 100;
            }
            else {
                growth = 0;
            }

        }
        else {

            growth =
                (
                    (
                        currentSaleValue -
                        previousSaleValue
                    )
                    /
                    previousSaleValue
                ) * 100;

        }
    }

    //--------------------------------------------------
    // Format period names
    //--------------------------------------------------

    function formatPeriod(period) {

        const p =
            String(period || "")
                .toLowerCase()
                .trim();

        const periodMap = {

            "today":
                "Today",

            "yesterday":
                "Yesterday",

            "thisweek":
                "This Week",

            "lastweek":
                "Last Week",

            "thisweek_mtd":
                "This Week",

            "lastweek_mtd":
                "Last Week",

            "thismonth":
                "This Month",

            "lastmonth":
                "Last Month",

            "thismonth_mtd":
                "This Month",

            "lastmonth_mtd":
                "Last Month",

            "thisyear":
                "This Year",

            "lastyear":
                "Last Year",

            "thisyear_ytd":
                "This Year",

            "lastyear_ytd":
                "Last Year",

            "thisfinancialyear":
                "This Financial Year",

            "lastfinancialyear":
                "Last Financial Year",

            "thisfinancialyear_ytd":
                "This Financial Year",

            "lastfinancialyear_ytd":
                "Last Financial Year"

        };

        if (periodMap[p]) {
            return periodMap[p];
        }

        return String(period)
            .replace(/_/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase());
    }


    const currentLabel =
        formatPeriod(currentPeriod);

    const previousLabel =
        formatPeriod(previousPeriod);


    //--------------------------------------------------
    // Comparison title
    //--------------------------------------------------

    let title =
        `${currentLabel} vs ${previousLabel}`;


    //--------------------------------------------------
    // Detect comparison type from user message
    //--------------------------------------------------

    const lowerMessage =
        String(message || "").toLowerCase();

    if (
        lowerMessage.includes("yesterday")
    ) {
        title =
            "Today vs Yesterday";
    }
    else if (
        lowerMessage.includes("last week") ||
        lowerMessage.includes("previous week")
    ) {
        title =
            "This Week vs Last Week";
    }
    else if (
        lowerMessage.includes("last month") ||
        lowerMessage.includes("previous month")
    ) {
        title =
            "This Month vs Last Month";
    }
    else if (
        lowerMessage.includes("last year") ||
        lowerMessage.includes("previous year")
    ) {
        title =
            "This Year vs Last Year";
    }
    else if (
        lowerMessage.includes("financial year") ||
        lowerMessage.includes("financial")
    ) {
        title =
            "This Financial Year vs Last Financial Year";
    }


    //--------------------------------------------------
    // Number formatter
    //--------------------------------------------------

    function formatNumber(value) {

        return Number(value || 0)
            .toLocaleString(
                "en-IN",
                {
                    maximumFractionDigits: 2
                }
            );
    }


    //--------------------------------------------------
    // Currency formatter
    //--------------------------------------------------

    function formatCurrency(value) {

        return `₹${formatNumber(value)}`;

    }


    //--------------------------------------------------
    // Signed number
    //--------------------------------------------------

    function formatSignedNumber(value) {

        const number =
            Number(value || 0);

        if (number > 0) {
            return `+${formatNumber(number)}`;
        }

        if (number < 0) {
            return `-${formatNumber(Math.abs(number))}`;
        }

        return "0";
    }


    //--------------------------------------------------
    // Signed currency
    //--------------------------------------------------

    function formatSignedCurrency(value) {

        const number =
            Number(value || 0);

        if (number > 0) {
            return `+₹${formatNumber(number)}`;
        }

        if (number < 0) {
            return `-₹${formatNumber(Math.abs(number))}`;
        }

        return "₹0";
    }


    //--------------------------------------------------
    // Growth formatting
    //--------------------------------------------------

    const growthText =
        `${growth >= 0 ? "" : ""}${growth.toFixed(2)}%`;


    //--------------------------------------------------
    // Business interpretation
    //--------------------------------------------------

    let conclusion = "";

    if (growth > 0) {

        conclusion =
            "📈 Sales are improving.";

    }
    else if (growth < 0) {

        conclusion =
            "📉 Sales are declining.";

    }
    else {

        conclusion =
            "➡️ Sales are stable.";

    }


    //--------------------------------------------------
    // Final response
    //--------------------------------------------------

    return [
        `📊 **Sales Comparison — ${title}**`,
        ``,
        `${currentLabel}: **${formatNumber(currentSaleCount)} sales** — **${formatCurrency(currentSaleValue)}**`,
        `${previousLabel}: **${formatNumber(previousSaleCount)} sales** — **${formatCurrency(previousSaleValue)}**`,
        ``,
        `Difference: **${formatSignedNumber(saleCountDifference)} sales** — **${formatSignedCurrency(saleValueDifference)}**`,
        `Growth: **${growthText}**`,
        ``,
        conclusion
    ].join("\n");
}


/**
 * ==================================================
 * MAIN AI ENGINE
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
        // CUSTOMER INTELLIGENCE
        //--------------------------------------------------

        if (
            routed.type === "customer"
        ) {

            const rows =
                Array.isArray(routed.data?.data)
                    ? routed.data.data
                    : [];

            const action =
                routed.action;

            if (!rows.length) {
                return "👤 **Customer Intelligence**\n\nNo matching customer records were found.";
            }

            //--------------------------------------------------
            // Customer profile
            //--------------------------------------------------

            if (action === "profile") {

                const row = rows[0];

                return [
                    `👤 **Customer Profile**`,
                    ``,
                    `**${row.CustomerName ?? row.customerName ?? "Unknown Customer"}**`,
                    ``,
                    row.MobileNo || row.mobileNo
                        ? `📱 **Mobile:** ${row.MobileNo ?? row.mobileNo}`
                        : null,
                    row.Email || row.email
                        ? `✉️ **Email:** ${row.Email ?? row.email}`
                        : null,
                    row.Address || row.address
                        ? `📍 **Address:** ${row.Address ?? row.address}`
                        : null,
                    row.PanNo || row.panNo
                        ? `🪪 **PAN:** ${row.PanNo ?? row.panNo}`
                        : null
                ].filter(Boolean).join("\n");

            }

            //--------------------------------------------------
            // Customer booking history
            //--------------------------------------------------

            if (action === "bookingHistory") {

                const lines = [
                    `🚗 **Customer Booking History**`,
                    ``,
                    `**${rows[0].CustomerName ?? "Customer"}**`,
                    ``
                ];

                rows.slice(0, 10).forEach((row, index) => {
                    const vehicle = [
                        row.Model,
                        row.Variant,
                        row.Color
                    ].filter(Boolean).join(" ");

                    lines.push(
                        `${index + 1}. **${vehicle || "Vehicle"}**`,
                        `   📅 Booking: ${row.BookingDate ?? "-"}`,
                        row.BookingType ? `   📌 Type: ${row.BookingType}` : null,
                        row.Branch ? `   🏢 Branch: ${row.Branch}` : null,
                        row.VINNo ? `   🔢 VIN: ${row.VINNo}` : null,
                        row.DeliveryDate ? `   🚚 Delivered: ${row.DeliveryDate}` : null,
                        ``
                    );
                });

                if (rows.length > 10) {
                    lines.push(`Showing the latest 10 of **${rows.length} bookings**.`);
                }

                return lines.filter(v => v !== null).join("\n").trim();
            }

            //--------------------------------------------------
            // Customer purchase summary
            //--------------------------------------------------

            if (action === "purchaseHistory") {

                const row = rows[0];
                const count = Number(row.PurchaseCount ?? row.purchaseCount ?? 0);
                const value = Number(row.TotalPurchaseValue ?? row.totalPurchaseValue ?? 0);
                const formatNumber = n => Number(n || 0).toLocaleString("en-IN");
                const formatCurrency = n => `₹${formatNumber(n)}`;

                return [
                    `💰 **Customer Purchase History**`,
                    ``,
                    `**${row.CustomerName ?? "Customer"}**`,
                    ``,
                    `🛒 **Purchases:** ${formatNumber(count)}`,
                    `💵 **Total Purchase Value:** ${formatCurrency(value)}`,
                    `📅 **First Purchase:** ${row.FirstPurchaseDate ?? "-"}`,
                    `📅 **Last Purchase:** ${row.LastPurchaseDate ?? "-"}`
                ].join("\n");
            }

            //--------------------------------------------------
            // Customer pending delivery / all pending customers
            //--------------------------------------------------

            if (
                action === "pendingDelivery" ||
                action === "customersPendingDelivery"
            ) {

                const lines = [
                    `🚚 **Pending Deliveries**`,
                    ``,
                    `**${rows.length} pending delivery record${rows.length === 1 ? "" : "s"}**`,
                    ``
                ];

                rows.slice(0, 20).forEach((row, index) => {
                    const vehicle = [
                        row.Model,
                        row.Variant,
                        row.Color
                    ].filter(Boolean).join(" ");

                    lines.push(
                        `${index + 1}. **${row.CustomerName ?? "Unknown Customer"}**`,
                        `   🚗 ${vehicle || "Vehicle"}`,
                        row.Branch ? `   🏢 ${row.Branch}` : null,
                        row.ChallanNo ? `   🧾 Challan: ${row.ChallanNo}` : null,
                        row.ExpectedDeliveryDate ? `   📅 Expected: ${row.ExpectedDeliveryDate}` : null,
                        row.VINNo ? `   🔢 VIN: ${row.VINNo}` : null,
                        ``
                    );
                });

                if (rows.length > 20) {
                    lines.push(`Showing the first 20 of **${rows.length} pending delivery records**.`);
                }

                return lines.filter(v => v !== null).join("\n").trim();
            }
        }


        //--------------------------------------------------
        // SALES COMPARISON
        //--------------------------------------------------
        //
        // IMPORTANT:
        // Handle SalesComparison BEFORE the generic
        // sales formatter.
        //
        // This prevents Gemini from incorrectly saying:
        //
        // "No sales data is available for comparison."
        //
        //--------------------------------------------------

        if (
            routed.type === "sales" &&
            routed.action === "salesComparison"
        ) {

            console.log(
                "======================================"
            );

            console.log(
                "SALES COMPARISON DATA"
            );

            console.log(
                JSON.stringify(
                    routed.data?.data,
                    null,
                    2
                )
            );

            console.log(
                "======================================"
            );


            return formatSalesComparison(
                routed.data?.data,
                message
            );

        }


        //--------------------------------------------------
        // OTHER SALES FORMATTING
        //--------------------------------------------------

        if (
            routed.type === "sales" &&
            [
                "sale",
                "yesterdaySale",
                "salesTrend"
            ].includes(routed.action) &&
            Array.isArray(routed.data?.data)
        ) {

            const salesPrompt = `
${SYSTEM_PROMPT}

You are MyAutoShop AI, a dealership business intelligence assistant.

Employee asked:
"${message}"

Business domain: sales
Action: ${routed.action}

The database returned this factual sales data:
${JSON.stringify(routed.data.data, null, 2)}

IMPORTANT RULES:

- Use ONLY the supplied data.
- Never invent a sales count, amount, date, model, or percentage.
- A value of 0 means zero sales; it does NOT mean that data is unavailable.
- If a requested value is absent from the data, say that the value is not available.
- Do not mention SQL, JSON, stored procedures, routing, tools, or internal implementation.
- Format the answer as Markdown suitable for a ChatGPT-style mobile chat.
- Use a short heading with bold key figures.
- Use bullet points for KPIs when appropriate.
- Keep the answer concise and business-focused.

For a simple sales-period question, prefer this structure:

### Sales Summary

- **Vehicles sold:** X
- **Sales value:** ₹X
- **Period:** X

For a trend question, clearly state whether sales are improving, declining, or stable based on the supplied result.
`;

            return await ai.generate(
                salesPrompt
            );

        }


        //--------------------------------------------------
        // Scalar Result
        //--------------------------------------------------

        if (
            Array.isArray(
                routed.data?.data
            ) &&
            routed.data.data.length === 1
        ) {

            const row =
                routed.data.data[0];

            const values =
                Object.values(row);

            if (values.length === 1) {

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

Instructions:

- Summarize the result naturally.
- Mention totals where appropriate.
- If there are multiple rows, provide a concise overview.
- Never mention SQL.
- Never mention JSON.
- Never expose internal implementation details.
- If there is no data, politely state that no records were found.
`;

            return await ai.generate(
                prompt
            );

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

If the employee asks about a feature that has not yet been implemented, politely explain that it is not currently available.
`;

    return await ai.generate(
        prompt
    );

}


module.exports = {
    runAI
};