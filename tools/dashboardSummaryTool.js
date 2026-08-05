const { executeTool } = require("./genericTool");

async function getDashboardSummary(context) {

    const [
        bookingCount,
        saleCount,
        bookingAmount,
        saleAmount,
        pendingDelivery
    ] = await Promise.all([

        executeTool("getTodayBookingCount", context),

        executeTool("getTodaySaleCount", context),

        executeTool("getTodayBookingAmount", context),

        executeTool("getTodaySaleAmount", context),

        executeTool("getPendingDelivery", context)

    ]);

    const bookings = bookingCount.value || 0;
    const sales = saleCount.value || 0;
    const bookingValue = bookingAmount.value || 0;
    const saleValue = saleAmount.value || 0;
    const pending = pendingDelivery.value || 0;

    return {

        success: true,

        dashboard: {

            bookingCount: bookings,

            saleCount: sales,

            bookingAmount: bookingValue,

            saleAmount: saleValue,

            pendingDelivery: pending,

            conversionRate:
                bookings > 0
                    ? ((sales / bookings) * 100).toFixed(2)
                    : 0,

            averageBookingValue:
                bookings > 0
                    ? Math.round(bookingValue / bookings)
                    : 0,

            averageSaleValue:
                sales > 0
                    ? Math.round(saleValue / sales)
                    : 0

        }

    };

}

module.exports = {
    getDashboardSummary
};