module.exports = [

    //--------------------------------------------------
    // Dashboard Summary (Composite Intent)
    //--------------------------------------------------

    {

        type: "dashboard",

        summary: true,

        tools: [

            "getTodayBookingCount",

            "getTodaySaleCount",

            "getTodayBookingAmount",

            "getTodaySaleAmount",

            "getPendingDelivery"

        ],

        patterns: [

            ["business"],

            ["business", "today"],

            ["today", "business"],

            ["dashboard"],

            ["today", "dashboard"],

            ["today", "summary"],

            ["business", "summary"],

            ["performance"],

            ["performance", "today"],

            ["today", "performance"],

            ["how", "is", "business"],

            ["how", "is", "business", "today"],

            ["today", "business", "report"],

            ["business", "report"]

        ]

    },

    //--------------------------------------------------
    // Today's Booking Count
    //--------------------------------------------------

    {

        type: "bookingCount",

        tool: "getTodayBookingCount",

        summary: false,

        patterns: [

            ["booking", "today"],

            ["bookings", "today"],

            ["today", "booking"],

            ["today", "bookings"],

            ["booking", "count"],

            ["bookings", "count"],

            ["today", "booking", "count"],

            ["how", "many", "bookings"],

            ["total", "bookings"],

            ["booked", "today"]

        ]

    },

    //--------------------------------------------------
    // Today's Sale Count
    //--------------------------------------------------

    {

        type: "saleCount",

        tool: "getTodaySaleCount",

        summary: false,

        patterns: [

            ["sale", "today"],

            ["sales", "today"],

            ["today", "sale"],

            ["today", "sales"],

            ["sale", "count"],

            ["sales", "count"],

            ["today", "sale", "count"],

            ["retail", "today"],

            ["how", "many", "sales"],

            ["total", "sales"]

        ]

    },

    //--------------------------------------------------
    // Today's Booking Amount
    //--------------------------------------------------

    {

        type: "bookingAmount",

        tool: "getTodayBookingAmount",

        summary: false,

        patterns: [

            ["booking", "amount"],

            ["booking", "value"],

            ["booking", "revenue"],

            ["booking", "collection"],

            ["today", "booking", "amount"],

            ["today", "booking", "value"],

            ["booking", "business"]

        ]

    },

    //--------------------------------------------------
    // Today's Sale Amount
    //--------------------------------------------------

    {

        type: "saleAmount",

        tool: "getTodaySaleAmount",

        summary: false,

        patterns: [

            ["sale", "amount"],

            ["sales", "amount"],

            ["sale", "value"],

            ["sales", "value"],

            ["retail", "amount"],

            ["retail", "value"],

            ["today", "sale", "amount"],

            ["today", "sales", "amount"]

        ]

    },

    //--------------------------------------------------
    // Pending Delivery
    //--------------------------------------------------

    {

        type: "pendingDelivery",

        tool: "getPendingDelivery",

        summary: false,

        patterns: [

            ["pending", "delivery"],

            ["pending", "deliveries"],

            ["delivery", "pending"],

            ["deliveries", "pending"],

            ["delivery", "due"],

            ["deliveries", "due"],

            ["pending", "vehicle", "delivery"],

            ["how", "many", "pending", "deliveries"],

            ["pending", "delivery", "count"]

        ]

    }

];