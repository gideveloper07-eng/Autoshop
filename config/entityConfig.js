/**
 * ==================================================
 * AI Entity Configuration
 * ==================================================
 *
 * Every entity loaded into AI cache is defined here.
 *
 * key     -> Property name inside cache
 * name    -> Friendly name for logging
 * idField -> Primary key
 * textField -> Display field
 * query   -> SQL query
 *
 * ==================================================
 */

module.exports = [

    //--------------------------------------------------
    // Branches
    //--------------------------------------------------

    {

        key: "branches",

        name: "Branches",

        idField: "BranchUnq",

        textField: "BranchName",

        query: `
            SELECT

                sp_602 as BranchUnq,

                sp_607 as BranchName

            FROM rh_sp_60

            ORDER BY BranchName
        `

    },

    //--------------------------------------------------
    // Vehicle Models
    //--------------------------------------------------

    {

        key: "models",

        name: "Models",

        idField: "ModelUnq",

        textField: "ModelName",

        query: `
            SELECT

                sp_202 as ModelUnq,

                sp_207 ModelName

            FROM rh_sp_20 where sp_208=(select pa_63 from rh_pa)

            ORDER BY ModelName
        `

    },

    //--------------------------------------------------
    // Vehicle Variants
    //--------------------------------------------------

    {

        key: "variants",

        name: "Variants",

        idField: "VariantUnq",

        textField: "VariantName",

        query: `
            SELECT
		distinct 
                sp_20_2 as VariantUnq,

                sp_20_3 VariantName

            FROM rh_sp_20_c

            ORDER BY sp_20_3
        `

    },

    //--------------------------------------------------
    // Sales Executives
    //--------------------------------------------------

    {

        key: "executives",

        name: "Sales Executives",

        idField: "ExecutiveUnq",

        textField: "ExecutiveName",

        query: `
select mcm_14 AS ExecutiveUnq,mcm_15 AS ExecutiveName from rh_mcm_1 order by mcm_15 asc
        `

    },

    //--------------------------------------------------
    // colours
    //--------------------------------------------------

    {

        key: "colours",

        name: "Colours",

        idField: "ColourUnq",

        textField: "ColourName",

        query: `
select sp_142 AS ColourUnq,sp_147 AS ColourName from rh_sp_14 order by sp_147 asc
        `

    },
//--------------------------------------------------
    // fuels
    //--------------------------------------------------

    {

        key: "fuels",

        name: "Fuels",

        idField: "FuelUnq",

        textField: "FuelName",

        query: `
select distinct sp_37_4 as FuelUnq, sp_37_4 as FuelName from rh_sp_37_c where sp_37_4 <> 'Select'
        `

    },
    //--------------------------------------------------
    // Customers
    //--------------------------------------------------

    {

        key: "customers",

        name: "Customers",

        idField: "CustomerUnq",

        textField: "CustomerName",

        query: `
            SELECT

                m1_2 as CustomerUnq,

                m1_7 as CustomerName,

                m1_47 as MobileNo

            FROM rh_m1 where m1_49='CUST'

            ORDER BY m1_7
        `

    },

   

];