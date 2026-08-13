const { matchIntent } = require("./intentMatcher");
const intentConfig = require("../config/intentConfig");

const { extractParameters } = require("./parameterExtractor");
const { detectDomain } = require("./domainRouter");
const { executeDomainTool } = require("./domainTool");
const { executeStoredProcedure } = require("../tools/baseTool");
const { executeCompositeTool } = require("../tools/compositeTool");
const { ensureEntityCache } = require("./entityLoader");

/**
 * ==================================================
 * AI ROUTER
 * ==================================================
 *
 * Main responsibilities:
 *
 * 1. Detect business domain/action.
 * 2. Extract date/entity filters.
 * 3. Resolve customer names from LIVE SQL (never customer cache).
 * 4. Detect ambiguous model names.
 * 4. Ask the employee to choose when required.
 * 5. Remember the pending choice.
 * 6. Execute the original request after selection.
 *
 * IMPORTANT:
 *
 * "nexon stock"
 *
 * must NOT execute overall stock when the cache
 * contains:
 *
 * NEXON
 * NEXON EV
 * NEXON EV 2.0
 * NEXON EV 3.0
 * NEXON ICNG
 * New NEXON
 *
 * Instead it asks the employee to choose.
 *
 * "nexon ev 2.0 stock"
 *
 * should directly use NEXON EV 2.0 because that
 * is an exact model-name match.
 * ==================================================
 */


/**
 * Pending selections are kept in memory.
 *
 * Keyed by employee + database so one employee's
 * selection cannot be accidentally used by another.
 *
 * This does not require another JS file.
 */
const pendingSelections = new Map();


/**
 * ==================================================
 * Basic Helpers
 * ==================================================
 */

function normalize(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

}


function compact(value) {

    return normalize(value)
        .replace(/[^a-z0-9]+/g, "");

}


/**
 * ==================================================
 * Pending Selection Key
 * ==================================================
 */

function getSelectionKey(context) {

    const database =
        context?.dealership?.database || "";

    const userId =
        context?.identity?.userId ||
        context?.identity?.employeeId ||
        context?.identity?.userCode ||
        context?.identity?.userName ||
        "anonymous";

    return `${String(database).toUpperCase()}::${String(userId).toUpperCase()}`;

}


/**
 * ==================================================
 * Save / Get / Clear Pending Selection
 * ==================================================
 */

function savePendingSelection(
    context,
    value
) {

    pendingSelections.set(
        getSelectionKey(context),
        value
    );

}


function getPendingSelection(context) {

    return pendingSelections.get(
        getSelectionKey(context)
    );

}


function clearPendingSelection(context) {

    pendingSelections.delete(
        getSelectionKey(context)
    );

}


/**
 * ==================================================
 * Entity Field Helpers
 * ==================================================
 *
 * Your cache may contain either:
 *
 * {
 *   unq: "...",
 *   name: "NEXON"
 * }
 *
 * or:
 *
 * {
 *   ModelUnq: "...",
 *   ModelName: "NEXON"
 * }
 *
 * Support both.
 * ==================================================
 */

function getEntityUnq(entity) {

    if (!entity) {
        return null;
    }

    return (
        entity.unq ??
        entity.Unq ??
        entity.ModelUnq ??
        entity.VariantUnq ??
        entity.ColourUnq ??
        entity.BranchUnq ??
        entity.FuelUnq ??
        entity.TransmissionUnq ??
        entity.ExecutiveUnq ??
        entity.CustomerUnq ??
        entity.FinanceCompanyUnq ??
        entity.VendorUnq ??
        null
    );

}


function getEntityName(entity) {

    if (!entity) {
        return "";
    }

    return (
        entity.name ??
        entity.Name ??
        entity.ModelName ??
        entity.VariantName ??
        entity.ColourName ??
        entity.BranchName ??
        entity.FuelName ??
        entity.TransmissionName ??
        entity.ExecutiveName ??
        entity.CustomerName ??
        entity.FinanceCompanyName ??
        entity.VendorName ??
        ""
    );

}


function getEntityAliases(entity) {

    if (!entity) {
        return [];
    }

    if (Array.isArray(entity.aliases)) {
        return entity.aliases;
    }

    if (Array.isArray(entity.Aliases)) {
        return entity.Aliases;
    }

    return [];
}


/**
 * ==================================================
 * Convert Entity To Filter Parameters
 * ==================================================
 */

function entityToParams(
    entityType,
    entity
) {

    const unq =
        getEntityUnq(entity);

    const name =
        getEntityName(entity);

    const params = {};

    const map = {

        models: "model",
        variants: "variant",
        colours: "colour",
        branches: "branch",
        fuels: "fuel",
        transmissions: "transmission",
        executives: "executive",
        customers: "customer",
        financeCompanies: "financeCompany",
        vendors: "vendor"

    };

    const prefix =
        map[entityType] ||
        String(entityType || "")
            .replace(/s$/, "");


    if (unq) {

        params[`${prefix}Unq`] =
            unq;

    }

    if (name) {

        params[`${prefix}Name`] =
            name;

    }

    return params;

}


/**
 * ==================================================
 * Get Entity Candidates
 * ==================================================
 */

async function getCandidates(
    context,
    entityType,
    message
) {

    const database =
        context?.dealership?.database;

    if (!database) {
        return [];
    }

    let cache;

    try {

        cache =
            await ensureEntityCache(
                database
            );

    }
    catch (err) {

        console.log(
            "ENTITY CACHE WARNING:",
            err.message
        );

        return [];

    }


    const list =
        Array.isArray(cache?.[entityType])
            ? cache[entityType]
            : [];


    const search =
        compact(
            message
        );

    if (!search) {
        return [];
    }


    //--------------------------------------------------
    // Remove common business words.
    //--------------------------------------------------

    const cleaned =
        compact(
            String(message)
                .replace(
                    /\b(stock|inventory|available|availability|vehicle|vehicles|current|show|give|tell|how|many|are|is|the|of|for)\b/gi,
                    " "
                )
        );


    const query =
        cleaned || search;


    //--------------------------------------------------
    // Score candidates.
    //
    // Exact name gets the highest score.
    //--------------------------------------------------

    const scored = [];


    for (const entity of list) {

        const name =
            compact(
                getEntityName(entity)
            );

        if (!name) {
            continue;
        }

        let score = 0;


        //--------------------------------------------------
        // Exact full phrase.
        //--------------------------------------------------

        if (
            search === name ||
            query === name
        ) {

            score = 1000;

        }


        //--------------------------------------------------
        // Exact name appears in the message.
        //--------------------------------------------------

        else if (
            search.includes(name)
        ) {

            score = 900 + name.length;

        }


        //--------------------------------------------------
        // Query appears inside entity name.
        //
        // This is what makes "nexon" match:
        //
        // NEXON
        // NEXON EV
        // NEXON EV 2.0
        // etc.
        //--------------------------------------------------

        else if (
            name.includes(query)
        ) {

            score = 500 + query.length;

        }


        //--------------------------------------------------
        // Alias.
        //--------------------------------------------------

        else {

            const aliases =
                getEntityAliases(entity);

            for (const alias of aliases) {

                const a =
                    compact(alias);

                if (!a) {
                    continue;
                }

                if (
                    search === a ||
                    query === a
                ) {

                    score =
                        Math.max(
                            score,
                            850 + a.length
                        );

                }
                else if (
                    search.includes(a)
                ) {

                    score =
                        Math.max(
                            score,
                            800 + a.length
                        );

                }

            }

        }


        if (score > 0) {

            scored.push({

                entity,

                score

            });

        }

    }


    //--------------------------------------------------
    // Remove duplicates.
    //--------------------------------------------------

    const unique =
        new Map();


    for (const item of scored) {

        const key =
            String(
                getEntityUnq(item.entity) ||
                getEntityName(item.entity)
            ).toLowerCase();

        if (
            !unique.has(key) ||
            unique.get(key).score < item.score
        ) {

            unique.set(
                key,
                item
            );

        }

    }


    return Array.from(
        unique.values()
    )
        .sort(
            (a, b) =>
                b.score - a.score
        )
        .map(
            item =>
                item.entity
        );

}


/**
 * ==================================================
 * Find Exact Entity Name
 * ==================================================
 */

async function findExactEntity(
    context,
    entityType,
    message
) {
    const candidates =
        await getCandidates(
            context,
            entityType,
            message
        );

    if (!candidates.length) {
        return null;
    }

    //--------------------------------------------------
    // IMPORTANT:
    // Only the cleaned business query can be considered
    // an exact entity name.
    //
    // "nexon stock"
    //        ↓
    // "nexon"
    //
    // "nexon ev 2.0 stock"
    //        ↓
    // "nexon ev 2.0"
    //--------------------------------------------------

    const cleanedQuery =
        String(message || "")
            .toLowerCase()
            .replace(
                /\b(stock|inventory|available|availability|vehicle|vehicles|current|show|give|tell|how|many|are|is|the|of|for|today|please|what|do|we|have|in|my)\b/gi,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();

    const queryCompact =
        compact(cleanedQuery);

    if (!queryCompact) {
        return null;
    }

    //--------------------------------------------------
    // Find TRUE exact model name.
    //--------------------------------------------------

    const exactMatches =
        candidates.filter(entity => {

            const entityName =
                compact(
                    getEntityName(entity)
                );

            if (
                entityName &&
                entityName === queryCompact
            ) {
                return true;
            }

            const aliases =
                getEntityAliases(entity);

            return aliases.some(alias =>
                compact(alias) === queryCompact
            );
        });

    //--------------------------------------------------
    // No exact entity.
    //--------------------------------------------------

    if (exactMatches.length === 0) {
        return null;
    }

    //--------------------------------------------------
    // If exactly one true exact match exists,
    // return it.
    //--------------------------------------------------

    if (exactMatches.length === 1) {
        return exactMatches[0];
    }

    return null;
}


/**
 * ==================================================
 * Selection Message
 * ==================================================
 */

function buildSelectionMessage(
    entityType,
    candidates
) {

    const labels = {

        models: "model",
        variants: "variant",
        colours: "colour",
        branches: "branch",
        fuels: "fuel",
        transmissions: "transmission",
        executives: "executive",
        customers: "customer",
        financeCompanies: "finance company",
        vendors: "vendor"

    };

    const label =
        labels[entityType] ||
        String(entityType || "entity")
            .replace(/s$/, "");


    const lines = [

        `I found multiple ${label}s matching your request. Please choose the ${label} you want.`

    ];


    candidates.forEach(
        (entity, index) => {

            lines.push(
                `${index + 1}. ${getEntityName(entity)}`
            );

        }
    );


    lines.push(
        "",
        "Please enter the number or the exact name."
    );


    return lines.join("\n");

}


/**
 * ==================================================
 * Resolve Selection Reply
 * ==================================================
 */

function resolveSelectionReply(
    message,
    candidates
) {

    const text =
        normalize(message);


    //--------------------------------------------------
    // Number selection
    //--------------------------------------------------

    const numberMatch =
        text.match(
            /^(?:option\s*)?(\d+)$/
        );


    if (numberMatch) {

        const index =
            Number(
                numberMatch[1]
            ) - 1;


        if (
            index >= 0 &&
            index < candidates.length
        ) {

            return candidates[index];

        }


        return null;

    }


    //--------------------------------------------------
    // Exact entity name.
    //--------------------------------------------------

    const requested =
        compact(message);


    for (
        const entity
        of candidates
    ) {

        const name =
            compact(
                getEntityName(entity)
            );


        if (
            requested === name
        ) {

            return entity;

        }


        const aliases =
            getEntityAliases(entity);


        for (const alias of aliases) {

            if (
                requested ===
                compact(alias)
            ) {

                return entity;

            }

        }

    }


    return null;

}


/**
 * ==================================================
 * Handle Pending Selection
 * ==================================================
 */

async function handlePendingSelection(
    message,
    context
) {

    const pending =
        getPendingSelection(
            context
        );


    if (!pending) {

        return null;

    }


    console.log(
        "======================================"
    );

    console.log(
        "PENDING ENTITY SELECTION"
    );

    console.log(
        "Entity Type :",
        pending.entityType
    );

    console.log(
        "Action      :",
        pending.action
    );

    console.log(
        "======================================"
    );


    const selected =
        resolveSelectionReply(
            message,
            pending.candidates
        );


    if (!selected) {

        return {

            handled: true,

            selectionRequired: true,

            type:
                pending.domain,

            action:
                pending.action,

            params:
                pending.baseParams || {},

            message:
                buildSelectionMessage(
                    pending.entityType,
                    pending.candidates
                ),

            options:
                pending.candidates,

            data: {

                success: true,

                pendingSelection: true

            }

        };

    }


    //--------------------------------------------------
    // Selection accepted.
    //--------------------------------------------------

    const selectedParams =
        entityToParams(
            pending.entityType,
            selected
        );


    const finalParams = {

        ...(pending.baseParams || {}),

        ...selectedParams

    };


    console.log(
        "SELECTED ENTITY :",
        getEntityName(selected)
    );

    console.log(
        "FINAL PARAMETERS"
    );

    console.table(
        finalParams
    );


    clearPendingSelection(
        context
    );


    //--------------------------------------------------
    // Execute original domain action.
    //--------------------------------------------------

    const result =
        await executeDomainTool({

            domain:
                pending.domain,

            action:
                pending.action,

            context,

            filters:
                finalParams

        });


    return {

        handled: true,

        type:
            pending.domain,

        action:
            pending.action,

        params:
            finalParams,

        data:
            result

    };

}


/**
 * ==================================================
 * Vehicle Stock Model Safety
 * ==================================================
 *
 * This is deliberately done in aiRouter instead
 * of trusting a generic partial-match resolver.
 *
 * Examples:
 *
 * "nexon stock"
 * -> multiple candidates
 * -> ask user
 *
 * "nexon ev 2.0 stock"
 * -> exact model
 * -> execute directly
 *
 * "harrier stock"
 * -> one candidate
 * -> execute directly
 *
 * "stock"
 * -> no model filter
 * -> overall stock
 * ==================================================
 */

async function resolveVehicleStockModel(
    message,
    context,
    currentParams
) {
    //--------------------------------------------------
    // If model already selected, respect it.
    //--------------------------------------------------

    if (currentParams?.modelUnq) {
        return {
            action: "continue",
            params: currentParams
        };
    }

    //--------------------------------------------------
    // Get model candidates.
    //--------------------------------------------------

    const candidates =
        await getCandidates(
            context,
            "models",
            message
        );

    if (!candidates.length) {
        return {
            action: "continue",
            params: currentParams
        };
    }

    //--------------------------------------------------
    // Clean business words from the question.
    //--------------------------------------------------

    const cleanedQuery =
        String(message || "")
            .toLowerCase()
            .replace(
                /\b(stock|inventory|available|availability|vehicle|vehicles|current|show|give|tell|how|many|are|is|the|of|for|today|please|what|do|we|have|in|my)\b/gi,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();

    const queryCompact =
        compact(cleanedQuery);

    //--------------------------------------------------
    // Find a TRUE exact model.
    //--------------------------------------------------

    const exact =
        candidates.find(entity => {

            const entityName =
                compact(
                    getEntityName(entity)
                );

            if (
                entityName &&
                entityName === queryCompact
            ) {
                return true;
            }

            const aliases =
                getEntityAliases(entity);

            return aliases.some(alias =>
                compact(alias) === queryCompact
            );
        });

    //--------------------------------------------------
    // IMPORTANT:
    //
    // If exact model is NEXON but related models also
    // exist, ask the employee to choose.
    //
    // Example:
    //
    // nexon stock
    //
    // NEXON
    // NEXON EV
    // NEXON EV 2.0
    // NEXON EV 3.0
    //--------------------------------------------------

    if (exact) {

        const exactName =
            normalize(
                getEntityName(exact)
            );

        const relatedModels =
            candidates.filter(entity => {

                const name =
                    normalize(
                        getEntityName(entity)
                    );

                if (!name || name === exactName) {
                    return false;
                }

                //--------------------------------------------------
                // NEXON EV
                // NEXON EV 2.0
                // NEXON EV 3.0
                //--------------------------------------------------

                return (
                    name.startsWith(
                        exactName + " "
                    ) ||
                    name ===
                        `new ${exactName}`
                );
            });

        //--------------------------------------------------
        // Base model + related models = ambiguous.
        //--------------------------------------------------

        if (relatedModels.length > 0) {

            return {
                action: "select",
                candidates: [
                    exact,
                    ...relatedModels
                ]
            };
        }

        //--------------------------------------------------
        // True unique exact model.
        //--------------------------------------------------

        return {
            action: "continue",
            params: {
                ...currentParams,
                ...entityToParams(
                    "models",
                    exact
                )
            }
        };
    }

    //--------------------------------------------------
    // Multiple partial matches.
    //--------------------------------------------------

    if (candidates.length > 1) {

        return {
            action: "select",
            candidates
        };
    }

    //--------------------------------------------------
    // One partial match.
    //--------------------------------------------------

    return {
        action: "continue",
        params: {
            ...currentParams,
            ...entityToParams(
                "models",
                candidates[0]
            )
        }
    };
}

/**
 * ==================================================
 * Normalize Extractor Result
 * ==================================================
 *
 * Supports BOTH:
 *
 * Old:
 *   { modelUnq: "..." }
 *
 * New:
 *   {
 *      params: {...},
 *      ambiguities: [...]
 *   }
 */

function normalizeExtractionResult(
    extracted
) {

    if (
        extracted &&
        typeof extracted === "object" &&
        (
            Object.prototype.hasOwnProperty.call(
                extracted,
                "params"
            ) ||
            Object.prototype.hasOwnProperty.call(
                extracted,
                "ambiguities"
            )
        )
    ) {

        return {

            params:
                extracted.params || {},

            ambiguities:
                Array.isArray(
                    extracted.ambiguities
                )
                    ? extracted.ambiguities
                    : []

        };

    }


    return {

        params:
            extracted || {},

        ambiguities: []

    };

}


/**
 * ==================================================
 * Execute Domain
 * ==================================================
 */

async function executeDomain(
    route,
    context,
    params
) {

    const result =
        await executeDomainTool({

            domain:
                route.domain,

            action:
                route.action,

            context,

            filters:
                params

        });


    return {

        handled: true,

        type:
            route.domain,

        action:
            route.action,

        params,

        data:
            result

    };

}



/**
 * ==================================================
 * Vehicle Stock Intelligence Action Resolver
 * ==================================================
 *
 * Specific stock questions must be resolved before the
 * generic "stock" action selected by detectDomain().
 *
 * Current stored-procedure support:
 *   VehicleStockByModel
 *   VehicleStockByVariant
 *
 * VehicleStockByColour is intentionally not selected here
 * until that @what is added to the stored procedure.
 */
function detectVehicleStockIntelligence(message) {

    const text = normalize(message);

    // Highest stock
    if (
        /\b(which|what)\s+(model|models)\s+(has|have|with)\s+(the\s+)?(highest|maximum|max|most)\s+stock\b/i.test(text) ||
        /\b(highest|maximum|max|most)\s+stock\s+(model|models)\b/i.test(text) ||
        /\bmodel\s+with\s+(the\s+)?(highest|maximum|max|most)\s+stock\b/i.test(text)
    ) {
        return "highestStock";
    }

    // Low stock / explicit threshold
    if (
        /\b(which|what)\s+(models?|vehicles?)\s+(are|have)\s+(in\s+)?low\s+stock\b/i.test(text) ||
        /\bmodels?\s+(with|having)\s+(low|short)\s+stock\b/i.test(text) ||
        /\b(show|give|list|find)\s+(me\s+)?models?\s+(with|having)\s+(less|under|below)\s+\d+\s+(vehicles?|cars?)\b/i.test(text) ||
        /\bmodels?\s+(with|having)\s+(less|under|below)\s+\d+\s+(vehicles?|cars?)\b/i.test(text) ||
        /\bless\s+than\s+\d+\s+(vehicles?|cars?)\b/i.test(text) ||
        /\bunder\s+\d+\s+(vehicles?|cars?)\b/i.test(text) ||
        /\bbelow\s+\d+\s+(vehicles?|cars?)\b/i.test(text)
    ) {
        return "lowStock";
    }

    // Zero-stock variants
    if (
        /\b(which|what)\s+variants?\s+(have|has|with)\s+(zero|no)\s+stock\b/i.test(text) ||
        /\bvariants?\s+(with|having)\s+(zero|no)\s+stock\b/i.test(text) ||
        /\bzero\s+stock\s+variants?\b/i.test(text) ||
        /\bvariants?\s+with\s+no\s+stock\b/i.test(text)
    ) {
        return "zeroStockVariant";
    }

    // Overstock
    if (
        /\b(which|what)\s+models?\s+(are|is)\s+overstocked\b/i.test(text) ||
        /\bwhich\s+models?\s+(have|has)\s+(excess|too much|high)\s+stock\b/i.test(text) ||
        /\boverstock(ed)?\b/i.test(text) ||
        /\bexcess\s+(stock|inventory)\b/i.test(text) ||
        /\btoo\s+much\s+stock\b/i.test(text)
    ) {
        return "overstocked";
    }

    // Sell priority
    if (
        /\bwhat\s+should\s+(i|we)\s+sell\s+first\b/i.test(text) ||
        /\bwhich\s+(car|cars|model|models)\s+should\s+(i|we)\s+sell\s+first\b/i.test(text) ||
        /\bwhich\s+stock\s+should\s+(i|we)\s+sell\s+first\b/i.test(text) ||
        /\bsell\s+priority\b/i.test(text) ||
        /\bsales\s+priority\b/i.test(text)
    ) {
        return "sellPriority";
    }

    return null;
}
/**
 * ==================================================
 * SALES PERFORMANCE INTELLIGENCE
 * ==================================================
 *
 * Detects questions such as:
 *
 * - How are we doing compared to yesterday?
 * - How are sales compared to yesterday?
 * - How are we doing compared to last month?
 * - Are sales improving?
 * - Are sales declining?
 * - What is the sales trend?
 *
 * Returns the business action that should be executed.
 * ==================================================
 */

function detectSalesPerformanceIntelligence(message) {

    const text = normalize(message);

    //--------------------------------------------------
    // TODAY vs YESTERDAY
    //--------------------------------------------------

    if (
        /\b(compared?\s+to|compare\s+(?:with|to)|versus|vs\.?)\s+yesterday\b/i.test(text) ||
        /\bhow\s+are\s+(?:we|sales)\s+(?:doing|performing)\s+(?:compared?\s+to|versus|vs\.?)\s+yesterday\b/i.test(text) ||
        /\bsales\s+(?:vs|versus|compared\s+to|compare\s+with)\s+yesterday\b/i.test(text)
    ) {

        return {
            action: "salesComparison",
            period: "today_vs_yesterday"
        };

    }


    //--------------------------------------------------
    // THIS MONTH vs LAST MONTH
    //--------------------------------------------------

    if (
        /\b(compared?\s+to|compare\s+(?:with|to)|versus|vs\.?)\s+last\s+month\b/i.test(text) ||
        /\bhow\s+are\s+(?:we|sales)\s+(?:doing|performing)\s+(?:compared?\s+to|versus|vs\.?)\s+last\s+month\b/i.test(text) ||
        /\bsales\s+(?:vs|versus|compared\s+to|compare\s+with)\s+last\s+month\b/i.test(text)
    ) {

        return {
            action: "salesComparison",
            period: "thismonth_vs_lastmonth"
        };

    }


    //--------------------------------------------------
    // SALES TREND
    //--------------------------------------------------

    if (
        /\bare\s+sales\s+(?:improving|increasing|growing|declining|falling|decreasing)\b/i.test(text) ||
        /\bis\s+sales\s+(?:improving|increasing|growing|declining|falling|decreasing)\b/i.test(text) ||
        /\bsales\s+trend\b/i.test(text) ||
        /\bsales\s+performance\s+trend\b/i.test(text) ||
        /\bhow\s+are\s+sales\s+(?:doing|performing)\b/i.test(text)
    ) {

        return {
            action: "salesTrend"
        };

    }


    return null;
}

/**
 * ==================================================
 * CUSTOMER INTELLIGENCE
 * ==================================================
 *
 * Customer Intelligence is additive only. Existing sales,
 * stock, booking, dashboard and legacy routing are left
 * untouched.
 *
 * Supported examples:
 *   Find customer Rahul Sharma
 *   Find Rahul Sharma
 *   What vehicle did Rahul Sharma book?
 *   Show Rahul Sharma's pending delivery
 *   How many times has Rahul Sharma purchased from us?
 *   Customers with pending deliveries
 *
 * Customer names are resolved from LIVE SQL (rh_m1) and
 * converted to customerUnq. The customer entity cache is NEVER
 * consulted for customer intelligence. Ambiguous live matches
 * ask for a selection instead of guessing.
 * ==================================================
 */

function detectCustomerIntelligence(message) {

    const text = normalize(message);

    //--------------------------------------------------
    // All customers with pending deliveries
    //--------------------------------------------------
    if (
        /\bcustomers?\s+(?:with|awaiting|waiting\s+for)\s+pending\s+deliver(?:y|ies)\b/i.test(text) ||
        /\bpending\s+deliver(?:y|ies)\s+customers?\b/i.test(text) ||
        /\bwho\s+(?:is|are)\s+waiting\s+for\s+(?:vehicle\s+)?deliver(?:y|ies)\b/i.test(text)
    ) {
        return {
            action: "customersPendingDelivery",
            requiresCustomer: false
        };
    }

    //--------------------------------------------------
    // Customer pending delivery
    //--------------------------------------------------
    if (
        /\b(?:show|find|check|get)\s+.+?['’]s\s+pending\s+deliver(?:y|ies)\b/i.test(text) ||
        /\bpending\s+deliver(?:y|ies)\s+(?:for|of)\s+.+/i.test(text) ||
        /\b(?:is|are)\s+.+?['’]s\s+deliver(?:y|ies)\s+pending\b/i.test(text)
    ) {
        return {
            action: "pendingDelivery",
            requiresCustomer: true
        };
    }

    //--------------------------------------------------
    // Customer purchase history
    //--------------------------------------------------
    if (
        /\bhow\s+many\s+times\s+(?:has|have)\s+.+?\s+(?:purchased|bought)\b/i.test(text) ||
        /\bhow\s+many\s+(?:vehicles?|cars?)\s+(?:has|have)\s+.+?\s+(?:purchased|bought)\b/i.test(text) ||
        /\b.+?\s+(?:purchased|bought)\s+from\s+us\b/i.test(text) ||
        /\bcustomer\s+(?:purchase|purchases|purchase\s+history)\b/i.test(text)
    ) {
        return {
            action: "purchaseHistory",
            requiresCustomer: true
        };
    }

    //--------------------------------------------------
    // Customer booking history
    //--------------------------------------------------
    if (
        /\bwhat\s+(?:vehicle|car)\s+did\s+.+?\s+book\b/i.test(text) ||
        /\bwhat\s+did\s+.+?\s+book\b/i.test(text) ||
        /\b.+?\s+booked\b/i.test(text) ||
        /\b(?:customer\s+)?book(?:ing|ings)\s+(?:for|of)\s+.+/i.test(text)
    ) {
        return {
            action: "bookingHistory",
            requiresCustomer: true
        };
    }

    //--------------------------------------------------
    // Customer profile / lookup
    //--------------------------------------------------
    if (
        /\bfind\s+(?:customer\s+)?[a-z0-9 .'-]+$/i.test(text) ||
        /\bshow\s+(?:customer\s+)?[a-z0-9 .'-]+$/i.test(text) ||
        /\b(?:customer\s+)?(?:profile|details|information|info)\s+(?:for|of)\s+.+/i.test(text) ||
        /\bwho\s+is\s+(?:customer\s+)?[a-z0-9 .'-]+$/i.test(text)
    ) {
        return {
            action: "profile",
            requiresCustomer: true
        };
    }

    return null;
}


/**
 * ==================================================
 * Extract Customer Name From User Message
 * ==================================================
 * Customer names are never resolved from the entity cache.
 * This function only extracts the customer text typed by the user.
 * ==================================================
 */
function extractCustomerNameFromMessage(message, action) {
    const text = String(message || "").trim();
    let name = "";

    if (!text) return "";

    if (action === "pendingDelivery") {
        let match = text.match(/\bpending\s+deliver(?:y|ies)\s+(?:for|of)\s+(.+?)\s*$/i);
        if (match) {
            name = match[1];
        } else {
            match = text.match(/^(.+?)['’]s\s+pending\s+deliver(?:y|ies)\s*$/i);
            if (match) name = match[1];
        }
    }

    if (!name && action === "purchaseHistory") {
        let match = text.match(/\bhow\s+many\s+times\s+(?:has|have)\s+(.+?)\s+(?:purchased|bought)\b/i);
        if (match) {
            name = match[1];
        } else {
            match = text.match(/^(.+?)\s+(?:purchased|bought)\s+from\s+us\s*$/i);
            if (match) name = match[1];
        }
    }

    if (!name && action === "bookingHistory") {
        let match = text.match(/\bwhat\s+(?:vehicle|car)\s+did\s+(.+?)\s+book\b/i);
        if (match) {
            name = match[1];
        } else {
            match = text.match(/\bwhat\s+did\s+(.+?)\s+book\b/i);
            if (match) {
                name = match[1];
            } else {
                match = text.match(/\b(?:customer\s+)?book(?:ing|ings)\s+(?:for|of)\s+(.+?)\s*$/i);
                if (match) name = match[1];
            }
        }
    }

    if (!name && action === "profile") {
        let match = text.match(/^(?:find|show)\s+(?:customer\s+)?(.+?)\s*$/i);
        if (match) {
            name = match[1];
        } else {
            match = text.match(/^who\s+is\s+(?:customer\s+)?(.+?)\s*$/i);
            if (match) {
                name = match[1];
            } else {
                match = text.match(/^(?:customer\s+)?(?:profile|details|information|info)\s+(?:for|of)\s+(.+?)\s*$/i);
                if (match) name = match[1];
            }
        }
    }

    return String(name || "")
        .replace(/[?!.]+$/g, "")
        .replace(/^customer\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
}


/**
 * ==================================================
 * Resolve Customer Intelligence Entity - LIVE SQL
 * ==================================================
 * NEVER calls getCandidates(), ensureEntityCache() or findExactEntity().
 * CustomerSearch executes against rh_m1 on every customer request.
 * ==================================================
 */
async function resolveCustomerIntelligence(message, context, action) {
    const customerName =
        extractCustomerNameFromMessage(message, action);

    console.log("======================================");
    console.log("LIVE CUSTOMER RESOLUTION");
    console.log("Action       :", action);
    console.log("CustomerName :", customerName);
    console.log("Source       : SQL / rh_m1");
    console.log("Cache        : DISABLED");
    console.log("======================================");

    if (!customerName) {
        return { action: "missingName" };
    }

    const searchResult =
        await executeDomainTool({
            domain: "customer",
            action: "search",
            context,
            filters: { customerName }
        });

    const rows =
        Array.isArray(searchResult?.data)
            ? searchResult.data
            : [];

    const candidates = rows
        .map(row => ({
            ...row,
            CustomerUnq:
                row.CustomerUnq ??
                row.customerUnq ??
                row.m1_2,
            CustomerName:
                row.CustomerName ??
                row.customerName ??
                row.m1_7
        }))
        .filter(row => row.CustomerUnq && row.CustomerName);

    if (!candidates.length) {
        return { action: "notFound", customerName };
    }

    const requested = compact(customerName);
    const exactMatches = candidates.filter(
        row => compact(row.CustomerName) === requested
    );

    if (exactMatches.length === 1) {
        return {
            action,
            params: entityToParams("customers", exactMatches[0])
        };
    }

    if (candidates.length === 1) {
        return {
            action,
            params: entityToParams("customers", candidates[0])
        };
    }

    return {
        action: "select",
        candidates
    };
}


/**
 * ==================================================
 * Main Router
 * ==================================================
 */

async function routeMessage(
    message,
    context
) {

    console.log(
        "======================================"
    );

    console.log(
        "AI ROUTER"
    );

    console.log(
        "MESSAGE :",
        message
    );

    console.log(
        "DATABASE:",
        context?.dealership?.database
    );

    console.log(
        "======================================"
    );


    //--------------------------------------------------
    // 1. Pending selection MUST come first.
    //--------------------------------------------------

    const pendingResult =
        await handlePendingSelection(
            message,
            context
        );


    if (pendingResult) {

        return pendingResult;

    }


    //--------------------------------------------------
    // 2. Detect domain/action.
    //--------------------------------------------------

    const route =
        detectDomain(message);

    // --------------------------------------------------
    // CUSTOMER INTELLIGENCE MUST OVERRIDE GENERIC ROUTES
    // --------------------------------------------------
    const customerIntelligence =
        detectCustomerIntelligence(message);

    if (customerIntelligence) {

        console.log(
            "CUSTOMER INTELLIGENCE DETECTED :",
            customerIntelligence
        );

        route.found = true;
        route.domain = "customer";
        route.action =
            customerIntelligence.action;
    }

    // --------------------------------------------------
    // SALES PERFORMANCE MUST OVERRIDE GENERIC SALES
    // --------------------------------------------------
    //
    // Examples:
    //   "How are we doing compared to yesterday?"
    //   "How are we doing compared to last month?"
    //   "Are sales improving?"
    //
    // Generic domain detection may otherwise return:
    //   sales -> sale
    //
    // We override it with the specific intelligence action.
    // --------------------------------------------------
    const salesIntelligence =
        detectSalesPerformanceIntelligence(message);

    if (salesIntelligence) {

        console.log(
            "SALES INTELLIGENCE DETECTED :",
            salesIntelligence
        );

        route.found = true;
        route.domain = "sales";
        route.action =
            salesIntelligence.action;
        route.salesPeriod =
            salesIntelligence.period || null;
    }


    // --------------------------------------------------
    // STOCK INTELLIGENCE MUST OVERRIDE GENERIC STOCK
    // --------------------------------------------------
    //
    // Example:
    //   "Which model has the highest stock?"
    //
    // Generic domain detection can otherwise return:
    //   vehicle -> stock
    //
    // We override it with:
    //   vehicle -> highestStock
    // --------------------------------------------------
    if (route.found && route.domain === "vehicle") {

        const intelligenceAction =
            detectVehicleStockIntelligence(message);

        if (intelligenceAction) {

            console.log(
                "STOCK INTELLIGENCE ACTION :",
                intelligenceAction
            );

            route.action =
                intelligenceAction;
        }
    }


    if (route.found) {

        console.log(
            "DOMAIN :",
            route.domain
        );

        console.log(
            "ACTION :",
            route.action
        );


        if (!route.action) {

            return {

                handled: true,

                type: "domain",

                data: {

                    success: false,

                    error:
                        `I understood the '${route.domain}' module but couldn't determine the requested action.`

                }

            };

        }


        //--------------------------------------------------
        // 3. CUSTOMER INTELLIGENCE - LIVE SQL FIRST
        //
        // DO NOT call extractParameters() before this block.
        // The normal extractor can resolve a stale customer from cache.
        //--------------------------------------------------
        if (
            route.domain === "customer" &&
            route.action !== "customersPendingDelivery"
        ) {
            const customerResolution =
                await resolveCustomerIntelligence(
                    message,
                    context,
                    route.action
                );

            if (customerResolution.action === "missingName") {
                return {
                    handled: true,
                    type: "customer",
                    action: route.action,
                    params: {},
                    data: { success: false, data: [] },
                    message: "👤 Please provide the customer name."
                };
            }

            if (customerResolution.action === "notFound") {
                return {
                    handled: true,
                    type: "customer",
                    action: route.action,
                    params: {},
                    data: { success: true, data: [] },
                    message:
                        `👤 **Customer not found**

I could not find **${customerResolution.customerName}** in the live customer master.`
                };
            }

            if (customerResolution.action === "select") {
                savePendingSelection(context, {
                    domain: "customer",
                    action: route.action,
                    entityType: "customers",
                    candidates: customerResolution.candidates,
                    baseParams: {}
                });

                return {
                    handled: true,
                    selectionRequired: true,
                    type: "customer",
                    action: route.action,
                    params: {},
                    message: buildSelectionMessage(
                        "customer",
                        customerResolution.candidates
                    ),
                    options: customerResolution.candidates,
                    data: {
                        success: true,
                        pendingSelection: true
                    }
                };
            }

            const liveCustomerParams =
                customerResolution.params || {};

            console.log("LIVE CUSTOMER PARAMETERS");
            console.table(liveCustomerParams);

            // Execute immediately. No parameterExtractor.
            return await executeDomain(
                route,
                context,
                liveCustomerParams
            );
        }

        //--------------------------------------------------
        // 4. Extract normal filters.
        //--------------------------------------------------
        let extraction;


        try {

            extraction =
                await extractParameters(
                    message,
                    context
                );

        }
        catch (err) {

            //--------------------------------------------------
            // If your filterResolver throws an ambiguity,
            // support that format too.
            //--------------------------------------------------

            if (
                err?.selectionRequired &&
                Array.isArray(err.options) &&
                err.options.length
            ) {

                const entityType =
                    err.entityType ||
                    "models";


                savePendingSelection(
                    context,
                    {

                        domain:
                            route.domain,

                        action:
                            route.action,

                        entityType,

                        candidates:
                            err.options,

                        baseParams: {}

                    }
                );


                return {

                    handled: true,

                    selectionRequired: true,

                    type:
                        route.domain,

                    action:
                        route.action,

                    params: {},

                    message:
                        buildSelectionMessage(
                            entityType,
                            err.options
                        ),

                    options:
                        err.options,

                    data: {

                        success: true,

                        pendingSelection: true

                    }

                };

            }


            throw err;

        }


        const normalized =
            normalizeExtractionResult(
                extraction
            );


        let params =
            normalized.params;

        // --------------------------------------------------
        // SALES INTELLIGENCE PARAMETERS
        // --------------------------------------------------
        //
        // SalesComparison receives an explicit period so the
        // stored procedure can compare the requested periods.
        //
        // Supported periods:
        //   today_vs_yesterday
        //   thismonth_vs_lastmonth
        // --------------------------------------------------
        if (route.domain === "sales") {

            if (route.action === "salesComparison") {

                params = {
                    ...params,
                    period:
                        route.salesPeriod
                };
            }

            else if (route.action === "salesTrend") {

                params = {
                    ...params
                };
            }

            console.log(
                "SALES INTELLIGENCE PARAMETERS"
            );

            console.table({
                action:
                    route.action,
                period:
                    params.period
            });
        }


        // --------------------------------------------------
        // STOCK INTELLIGENCE PARAMETERS
        // --------------------------------------------------

        if (route.domain === "vehicle") {

    const text =
        normalize(message);

    //--------------------------------------------------
    // HIGHEST STOCK
    //--------------------------------------------------

    if (route.action === "highestStock") {

        params = {
            ...params,

            stockMode: "highest",

            stockLimit: 1
        };

        //--------------------------------------------------
        // Example:
        // "top 5 models with highest stock"
        //--------------------------------------------------

        const topMatch =
            text.match(
                /\btop\s+(\d+)\b/i
            );

        if (topMatch) {

            params.stockLimit =
                Number(topMatch[1]);

        }
    }


    //--------------------------------------------------
    // LOW STOCK
    //--------------------------------------------------

    else if (route.action === "lowStock") {

        params = {
            ...params,

            stockMode: "low",

            stockThreshold: 5
        };

        //--------------------------------------------------
        // Examples:
        //
        // less than 5 vehicles
        // under 10 cars
        // below 3 vehicles
        //--------------------------------------------------

        const thresholdMatch =
            text.match(
                /\b(?:less than|under|below)\s+(\d+)\s+(?:vehicles?|cars?)\b/i
            );

        if (thresholdMatch) {

            params.stockThreshold =
                Number(thresholdMatch[1]);

        }
    }


    //--------------------------------------------------
    // OVERSTOCK
    //--------------------------------------------------

    else if (route.action === "overstocked") {

        params = {
            ...params,

            stockMode: "overstock",

            stockThreshold: 20
        };

        //--------------------------------------------------
        // Examples:
        //
        // over 20 vehicles
        // more than 30 cars
        // above 50 vehicles
        //--------------------------------------------------

        const thresholdMatch =
            text.match(
                /\b(?:more than|over|above)\s+(\d+)\s+(?:vehicles?|cars?)\b/i
            );

        if (thresholdMatch) {

            params.stockThreshold =
                Number(thresholdMatch[1]);

        }
    }


    //--------------------------------------------------
    // SELL PRIORITY
    //--------------------------------------------------

    else if (route.action === "sellPriority") {

        params = {
            ...params,

            stockMode: "sellPriority",

            stockLimit: 5
        };

        //--------------------------------------------------
        // Example:
        //
        // top 10 cars to sell first
        //--------------------------------------------------

        const topMatch =
            text.match(
                /\btop\s+(\d+)\b/i
            );

        if (topMatch) {

            params.stockLimit =
                Number(topMatch[1]);

        }
    }


    //--------------------------------------------------
    // DEBUG
    //--------------------------------------------------

    console.log(
        "STOCK INTELLIGENCE PARAMETERS"
    );

    console.table({
        action:
            route.action,

        stockMode:
            params.stockMode,

        stockThreshold:
            params.stockThreshold,

        stockLimit:
            params.stockLimit
    });

}

        //--------------------------------------------------
        // 4. Handle ambiguities returned by extractor.
        //--------------------------------------------------

        if (
            normalized.ambiguities.length
        ) {

            const ambiguity =
                normalized.ambiguities[0];


            const candidates =
                ambiguity.candidates || [];


            if (candidates.length) {

                const entityType =
                    ambiguity.entityType ||
                    ambiguity.filterPrefix ||
                    "models";


                savePendingSelection(
                    context,
                    {

                        domain:
                            route.domain,

                        action:
                            route.action,

                        entityType,

                        candidates,

                        baseParams:
                            params

                    }
                );


                return {

                    handled: true,

                    selectionRequired: true,

                    type:
                        route.domain,

                    action:
                        route.action,

                    params,

                    message:
                        buildSelectionMessage(
                            entityType,
                            candidates
                        ),

                    options:
                        candidates,

                    data: {

                        success: true,

                        pendingSelection: true

                    }

                };

            }

        }


        //--------------------------------------------------
        // 5. CRITICAL VEHICLE STOCK CHECK.
        //--------------------------------------------------

        if (
            route.domain === "vehicle" &&
            route.action === "stock"
        ) {

            const modelResolution =
                await resolveVehicleStockModel(
                    message,
                    context,
                    params
                );


            //--------------------------------------------------
            // Ask model selection.
            //--------------------------------------------------

            if (
                modelResolution.action ===
                "select"
            ) {

                savePendingSelection(
                    context,
                    {

                        domain:
                            route.domain,

                        action:
                            route.action,

                        entityType:
                            "models",

                        candidates:
                            modelResolution.candidates,

                        baseParams:
                            params

                    }
                );


                console.log(
                    "MODEL AMBIGUITY DETECTED"
                );

                console.table(
                    modelResolution.candidates.map(
                        (entity, index) => ({

                            option:
                                index + 1,

                            name:
                                getEntityName(entity),

                            unq:
                                getEntityUnq(entity)

                        })
                    )
                );


                return {

                    handled: true,

                    selectionRequired: true,

                    type:
                        route.domain,

                    action:
                        route.action,

                    params,

                    message:
                        buildSelectionMessage(
                            "models",
                            modelResolution.candidates
                        ),

                    options:
                        modelResolution.candidates,

                    data: {

                        success: true,

                        pendingSelection: true

                    }

                };

            }


            params =
                modelResolution.params;

        }


        //--------------------------------------------------
        // 6. Execute domain action.
        //--------------------------------------------------

        return await executeDomain(
            route,
            context,
            params
        );

    }


    //--------------------------------------------------
    // 7. Legacy intent matching.
    //--------------------------------------------------

    const intent =
        matchIntent(
            message,
            intentConfig
        );


    if (!intent) {

        return {

            handled: false

        };

    }


    console.log(
        "LEGACY INTENT :",
        intent.type
    );


    //--------------------------------------------------
    // 8. Extract parameters.
    //--------------------------------------------------

    const extraction =
        await extractParameters(
            message,
            context
        );


    const normalized =
        normalizeExtractionResult(
            extraction
        );


    //--------------------------------------------------
    // 9. Composite tool.
    //--------------------------------------------------

    if (
        Array.isArray(intent.tools) &&
        intent.tools.length
    ) {

        const result =
            await executeCompositeTool(
                intent.tools,
                context,
                normalized.params
            );


        return {

            handled: true,

            type:
                intent.type,

            summary: true,

            params:
                normalized.params,

            data:
                result

        };

    }


    //--------------------------------------------------
    // 10. Single legacy tool.
    //--------------------------------------------------

    const result =
        await executeStoredProcedure({

            toolName:
                intent.tool,

            context,

            params:
                normalized.params

        });


    return {

        handled: true,

        type:
            intent.type,

        summary: false,

        params:
            normalized.params,

        data:
            result

    };

}


module.exports = {

    routeMessage,

    resolveSelectionReply,

    detectVehicleStockIntelligence,

    detectSalesPerformanceIntelligence,

    detectCustomerIntelligence,

    getPendingSelection,

    clearPendingSelection

};
