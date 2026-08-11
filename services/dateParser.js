/**
 * Date Parser
 *
 * Converts natural language date expressions
 * into structured date ranges.
 */

function formatDate(date) {

    return date.toISOString().split("T")[0];

}

function startOfMonth(date) {

    return new Date(

        date.getFullYear(),

        date.getMonth(),

        1

    );

}

function endOfMonth(date) {

    return new Date(

        date.getFullYear(),

        date.getMonth() + 1,

        0

    );

}

function getFinancialYear(date) {

    const year = date.getFullYear();

    const month = date.getMonth() + 1;

    if (month >= 4) {

        return {

            fromDate: `${year}-04-01`,

            toDate: `${year + 1}-03-31`

        };

    }

    return {

        fromDate: `${year - 1}-04-01`,

        toDate: `${year}-03-31`

    };

}

/**
 * Parse natural language dates.
 */
function parseDateRange(message) {

    const text =

        (message || "").toLowerCase();

    const today = new Date();

    //--------------------------------------------------
    // Today
    //--------------------------------------------------

    if (text.includes("today")) {

        return {

            fromDate: formatDate(today),

            toDate: formatDate(today),

            period: "today"

        };

    }

    //--------------------------------------------------
    // Yesterday
    //--------------------------------------------------

    if (text.includes("yesterday")) {

        const yesterday = new Date(today);

        yesterday.setDate(

            yesterday.getDate() - 1

        );

        return {

            fromDate: formatDate(yesterday),

            toDate: formatDate(yesterday),

            period: "yesterday"

        };

    }

    //--------------------------------------------------
    // Last 7 Days
    //--------------------------------------------------

    if (

        text.includes("last 7 days") ||

        text.includes("last seven days")

    ) {

        const from = new Date(today);

        from.setDate(

            from.getDate() - 6

        );

        return {

            fromDate: formatDate(from),

            toDate: formatDate(today),

            period: "last7days"

        };

    }

    //--------------------------------------------------
    // This Month
    //--------------------------------------------------

    if (

        text.includes("this month") ||

        text.includes("current month")

    ) {

        return {

            fromDate: formatDate(

                startOfMonth(today)

            ),

            toDate: formatDate(

                endOfMonth(today)

            ),

            period: "thisMonth"

        };

    }

    //--------------------------------------------------
    // Last Month
    //--------------------------------------------------

    if (text.includes("last month")) {

        const first =

            new Date(

                today.getFullYear(),

                today.getMonth() - 1,

                1

            );

        const last =

            new Date(

                today.getFullYear(),

                today.getMonth(),

                0

            );

        return {

            fromDate: formatDate(first),

            toDate: formatDate(last),

            period: "lastMonth"

        };

    }

    //--------------------------------------------------
    // Financial Year
    //--------------------------------------------------

    if (

        text.includes("financial year") ||

        text.includes("current fy") ||

        text.includes("current financial year")

    ) {

        return {

            ...getFinancialYear(today),

            period: "financialYear"

        };

    }

    //--------------------------------------------------
    // Default
    //--------------------------------------------------

    return {};

}

module.exports = {

    parseDateRange

};