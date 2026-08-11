/**
 * ==================================================
 * MyAutoShop AI Business Domains
 * ==================================================
 *
 * This file is the single source of truth
 * for every AI business capability.
 *
 * Every action defines:
 *
 *  - keywords
 *  - SQL @what
 *  - permissions
 *  - response type
 *  - accepted parameters
 *
 */

module.exports = {

    //--------------------------------------------------
    // VEHICLE
    //--------------------------------------------------

    vehicle: {

        displayName: "Vehicle",

        enabled: true,

        keywords: [

            "vehicle",
            "vehicles",
            "car",
            "cars",
            "stock",
            "inventory",
            "yard",
            "transit",
            "allocation",
            "purchase",
            "grn",
            "vin",
            "engine",
            "chassis",
            "accessory",
            "accessories"

        ],

        actions: {

            //--------------------------------------------------
            // Vehicle Stock
            //--------------------------------------------------

            stock: {

                enabled: true,

                description:
                    "Returns current vehicle stock.",

                keywords: [

                    "stock",
                    "inventory",
                    "available",
                    "free stock",
                    "vehicle stock",
                    "current stock"

                ],

                what: "VehicleStock",

                permission: "STOCK_VIEW",

                responseType: "scalar",

                parameters: [

                    "branchUnq",

                    "modelUnq",

                    "variantUnq",

                    "colourUnq",

                    "fuelUnq",

                    "transmissionUnq"

                ]

            },

            //--------------------------------------------------
            // STOCK INTELLIGENCE
            //--------------------------------------------------

            highestStock: {

                enabled: true,

                description:
                    "Finds the model with the highest available stock.",

                keywords: [
                    "high in stock",
                    "high stock",
                    "highest stock",
                    "most stock",
                    "maximum stock",
                    "max stock",
                    "model with highest stock",
                    "which model has highest stock",
                    "which model has the most stock"
                ],

                what: "VehicleStockByModel",

                permission: "STOCK_VIEW",

                responseType: "table",

                parameters: [
                        "branchUnq",
    "modelUnq",
    "stockMode",
    "stockLimit"
                ]
            },

            //--------------------------------------------------
            // LOW STOCK
            //--------------------------------------------------

            lowStock: {

                enabled: true,

                description:
                    "Finds models with low vehicle stock.",

                keywords: [
                    "low stock",
                    "low in stock",
		    "lowest stock",	
                    "low stocks",
                    "short stock",
                    "shortage",
                    "models with low stock",
		    "models with lowest stock",
                    "below stock",
                    "less than stock",
                    "under stock"
                ],

                what: "VehicleStockByModel",

                permission: "STOCK_VIEW",

                responseType: "table",

                parameters: [
                     "branchUnq",
    "modelUnq",
    "stockMode",
    "stockThreshold"
                ]
            },

            //--------------------------------------------------
            // ZERO STOCK VARIANTS
            //--------------------------------------------------

            zeroStockVariant: {

                enabled: true,

                description:
                    "Finds variants having zero available stock.",

                keywords: [
                    "zero stock",
                    "zero stock variant",
                    "variants with zero stock",
                    "variant with zero stock",
                    "no stock variant",
                    "variants with no stock"
                ],

                what: "VehicleStockByVariant",

                permission: "STOCK_VIEW",

                responseType: "table",

                parameters: [
                    "branchUnq",
                    "modelUnq",
                    "variantUnq"
                ]
            },

            //--------------------------------------------------
            // OVERSTOCK
            //--------------------------------------------------

            overstocked: {

                enabled: true,

                description:
                    "Identifies models carrying unusually high stock.",

                keywords: [
                    "overstock",
                    "overstocked",
                    "over stock",
                    "excess stock",
                    "excess inventory",
                    "too much stock",
                    "which models are overstocked"
                ],

                what: "VehicleStockByModel",

                permission: "STOCK_VIEW",

                responseType: "table",

                  parameters: [
        "branchUnq",
        "modelUnq",
        "stockMode",
        "stockThreshold"
    ]
            },

            //--------------------------------------------------
            // SELL PRIORITY
            //--------------------------------------------------

            sellPriority: {

                enabled: true,

                description:
                    "Ranks models that should be prioritized for sales based on available stock.",

                keywords: [
                    "what should i sell first",
                    "what should we sell first",
                    "which car should i sell first",
                    "which model should i sell first",
                    "sell first",
                    "sell priority",
                    "sales priority",
                    "which stock should i sell first"
                ],

                what: "VehicleStockByModel",

                permission: "STOCK_VIEW",

                responseType: "table",

               parameters: [
    "branchUnq",
    "modelUnq",
    "stockMode",
    "stockLimit"
]
            },

            //--------------------------------------------------
            // Transit
            //--------------------------------------------------

            transit: {

                enabled: true,

                description:
                    "Returns vehicles in transit.",

                keywords: [

                    "transit",

                    "in transit"

                ],

                what: "VehicleTransit",

                permission: "STOCK_VIEW",

                responseType: "table",

                parameters: [

                    "branchUnq",

                    "modelUnq"

                ]

            },

            //--------------------------------------------------
            // Allocation
            //--------------------------------------------------

            allocation: {

                enabled: true,

                description:
                    "Returns allocated vehicles.",

                keywords: [

                    "allocation",

                    "allocated"

                ],

                what: "VehicleAllocation",

                permission: "STOCK_VIEW",

                responseType: "table",

                parameters: [

                    "branchUnq",

                    "modelUnq"

                ]

            },

            //--------------------------------------------------
            // Purchase
            //--------------------------------------------------

            purchase: {

                enabled: true,

                description:
                    "Returns purchased vehicles.",

                keywords: [

                    "purchase",

                    "purchased"

                ],

                what: "VehiclePurchase",

                permission: "PURCHASE_VIEW",

                responseType: "table",

                parameters: [

                    "branchUnq",

                    "modelUnq"

                ]

            },

            //--------------------------------------------------
            // GRN
            //--------------------------------------------------

            grn: {

                enabled: true,

                description:
                    "Returns goods receipt details.",

                keywords: [

                    "grn",

                    "goods receipt"

                ],

                what: "VehicleGRN",

                permission: "PURCHASE_VIEW",

                responseType: "table",

                parameters: [

                    "branchUnq"

                ]

            }

        }

    },

    //--------------------------------------------------
    // SALES
    //--------------------------------------------------

    sales: {

        displayName: "Sales",

        enabled: true,

        keywords: [

            "sale",
            "sales",
            "booking",
            "bookings",
            "retail",
            "invoice",
            "delivery",
            "deliveries",
            "enquiry",
            "enquiries",
            "inquiry",
            "test drive"

        ],

        actions: {

            //--------------------------------------------------
            // Booking
            //--------------------------------------------------

            booking: {

                enabled: true,

                description:
                    "Returns booking information.",

                keywords: [

                    "booking",

                    "bookings",

                    "booked"

                ],

                what: "TodayBooking",

                permission: "BOOKING_VIEW",

                responseType: "table",

                parameters: [

                    "fromDate",

                    "toDate",

                    "branchUnq",

                    "executiveUnq",

                    "customerUnq",

                    "modelUnq",

                    "financeCompanyUnq"

                ]

            },

            //--------------------------------------------------
            // Sale
            //--------------------------------------------------

        sale: {

    enabled: true,

    description:
        "Returns today's sales information.",

    keywords: [
        "sale",
        "sales",
        "retail",
        "today's sales",
        "today sales",
        "today sale"
    ],

    what: "TodaySale",

    permission: "SALE_VIEW",

    responseType: "table",

    parameters: [
        "fromDate",
        "toDate",
        "branchUnq",
        "executiveUnq",
        "customerUnq",
        "modelUnq"
    ]

},

//--------------------------------------------------
// Yesterday Sale
//--------------------------------------------------

        yesterdaySale: {

    enabled: true,

    description:
        "Returns yesterday's sales information.",

    keywords: [
        "yesterday's sales",
        "yesterday sales",
        "yesterday's sale",
        "yesterday sale",
        "sales yesterday",
        "sale yesterday"
    ],

    what: "YesterdaySale",

    permission: "SALE_VIEW",

    responseType: "table",

    parameters: [
        "fromDate",
        "toDate",
        "branchUnq",
        "executiveUnq",
        "customerUnq",
        "modelUnq"
    ]

},

            //--------------------------------------------------
            // Delivery
            //--------------------------------------------------

            delivery: {

                enabled: true,

                description:
                    "Returns delivery information.",

                keywords: [

                    "delivery",

                    "deliveries"

                ],

                what: "PendingDelivery",

                permission: "DELIVERY_VIEW",

                responseType: "table",

                parameters: [

                    "fromDate",

                    "toDate",

                    "branchUnq",

                    "executiveUnq",

                    "customerUnq"

                ]

            },

            //--------------------------------------------------
            // Enquiry
            //--------------------------------------------------

            enquiry: {

                enabled: true,

                description:
                    "Returns enquiry information.",

                keywords: [

                    "enquiry",

                    "enquiries",

                    "inquiry"

                ],

                what: "TodayEnquiry",

                permission: "ENQUIRY_VIEW",

                responseType: "table",

                parameters: [

                    "fromDate",

                    "toDate",

                    "branchUnq",

                    "executiveUnq",

                    "customerUnq"

                ]

            },
//--------------------------------------------------
// SALES COMPARISON
//--------------------------------------------------

salesComparison: {

    enabled: true,

    description:
        "Compares sales performance between two periods.",

    keywords: [
        "compared to yesterday",
        "compare with yesterday",
        "yesterday comparison",
        "compared to last month",
        "compare with last month",
        "last month comparison",
        "sales comparison"
    ],

    what: "SalesComparison",

    permission: "SALE_VIEW",

    responseType: "table",

    parameters: [
        "period",
        "branchUnq",
        "executiveUnq",
        "modelUnq"
    ]

},

//--------------------------------------------------
// SALES TREND
//--------------------------------------------------

salesTrend: {

    enabled: true,

    description:
        "Determines whether sales are improving or declining.",

    keywords: [
        "sales improving",
        "sales getting better",
        "sales getting worse",
        "sales trend",
        "sales performance trend",
        "are sales improving",
        "are sales declining"
    ],

    what: "SalesTrend",

    permission: "SALE_VIEW",

    responseType: "table",

    parameters: [
        "branchUnq",
        "executiveUnq",
        "modelUnq"
    ]

},
//--------------------------------------------------
// SALES EXECUTIVE PERFORMANCE
//--------------------------------------------------

executivePerformance: {

    enabled: true,

    description:
        "Returns sales executive performance including bookings, sales count and sales value for a requested period.",

    keywords: [
        "sales executive performance",
        "executive performance",
        "sales executive",
        "sales executives",
        "top sales executive",
        "top sales executives",
        "best sales executive",
        "best sales executives",
        "who sold the most cars",
        "who sold the most vehicles",
        "most cars sold",
        "most vehicles sold",
        "highest sales",
        "highest sales executive",
        "top performer",
        "top performers",
        "most bookings",
        "who has the most bookings",
        "executive with most bookings",
        "sales performance by executive",
        "executive sales performance"
    ],

    what: "ExecutivePerformance",

    permission: "SALE_VIEW",

    responseType: "table",

    parameters: [
        "period",
        "branchUnq",
        "executiveUnq"
    ]
},

//--------------------------------------------------
// EXECUTIVE CONVERSION PERFORMANCE
//--------------------------------------------------

executiveConversionPerformance: {

    enabled: true,

    description:
        "Returns eligible bookings, converted bookings and conversion rate for each sales executive.",

    keywords: [
        "executive conversion performance",
        "conversion performance",
        "booking conversion",
        "booking conversion rate",
        "conversion rate",
        "executive conversion",
        "sales conversion",
        "sales executive conversion",
        "best conversion",
        "highest conversion",
        "highest conversion rate",
        "best conversion rate",
        "who converts the most bookings",
        "which executive has the highest conversion",
        "which executive has the best conversion",
        "top conversion executive",
        "top conversion executives",
        "executive with highest conversion",
        "executive with best conversion",
        "booking conversion by executive",
        "conversion by executive",
        "executive booking conversion"
    ],

    what: "ExecutiveConversionPerformance",

    permission: "SALE_VIEW",

    responseType: "table",

    parameters: [
        "period",
        "branchUnq",
        "executiveUnq"
    ]
},
//--------------------------------------------------
// Test Drive
            //--------------------------------------------------

            testDrive: {

                enabled: true,

                description:
                    "Returns test drive information.",

                keywords: [

                    "test drive",

                    "testdrive"

                ],

                what: "TodayTestDrive",

                permission: "TESTDRIVE_VIEW",

                responseType: "table",

                parameters: [

                    "fromDate",

                    "toDate",

                    "branchUnq",

                    "executiveUnq",

                    "customerUnq"

                ]

            }

        }

    }

};