async function getVehicleStock(context) {

    return executeStoredProcedure({

        toolName: "getVehicleStock",

        context,

        procedure: "A_SP_STOCK",

        params: {

            BranchUnq:
                context.dealership.branchUnq,

            Category:
                "SUV"

        }

    });

}