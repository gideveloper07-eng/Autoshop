module.exports = {

    getTodayBookingCount: {

        procedure: "A_SP_FOR_ApplicationChallangrid",

        what: "TodayBooking",

        permission: "BOOKING_VIEW",

        responseType: "scalar",

        parameters: [],

        description: "Returns today's booking count."

    },

    getTodaySaleCount: {

        procedure: "A_SP_FOR_ApplicationChallangrid",

        what: "TodaySale",

        permission: "SALE_VIEW",

        responseType: "scalar",

        parameters: [],

        description: "Returns today's sale count."

    },

    getTodayBookingAmount: {

        procedure: "A_SP_FOR_ApplicationChallangrid",

        what: "TodayBookingAmount",

        permission: "BOOKING_VIEW",

        responseType: "scalar",

        parameters: [],

        description: "Returns today's booking amount."

    },

    getTodaySaleAmount: {

        procedure: "A_SP_FOR_ApplicationChallangrid",

        what: "TodaySaleAmount",

        permission: "SALE_VIEW",

        responseType: "scalar",

        parameters: [],

        description: "Returns today's sale amount."

    },

    getPendingDelivery: {

        procedure: "A_SP_FOR_ApplicationChallangrid",

        what: "PendingDelivery",

        permission: "DELIVERY_VIEW",

        responseType: "scalar",

        parameters: [],

        description: "Returns pending deliveries."

    },

getVehicleStock: {

    procedure: "A_SP_FOR_ApplicationChallangrid",

    what: "VehicleStock",

    permission: "STOCK_VIEW",

    responseType: "scalar",

    contextParameters: [],

    parameters: [],

    description: "Returns current free vehicle stock."

}

};