async function getCustomerHistory(context, customerId) {

    return executeStoredProcedure({

        toolName: "getCustomerHistory",

        context,

        procedure: "A_SP_CUSTOMER_HISTORY",

        params: {

            CustomerId: customerId

        }

    });

}