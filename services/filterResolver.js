const {
    ensureEntityCache
} = require("./entityLoader");

/**
 * ==================================================
 * ENTITY FILTER RESOLVER
 * ==================================================
 *
 * Currently supported:
 *
 *   MODEL
 *   VARIANT
 *
 * Other entity types are kept here for future phases,
 * but Model / Variant are the primary filters.
 *
 * IMPORTANT:
 *
 * "nexon stock"
 *
 * must NOT automatically select the base NEXON model
 * when related models exist.
 *
 * Example:
 *
 * NEXON
 * NEXON EV
 * NEXON EV 2.0
 * NEXON EV 3.0
 * NEXON ICNG
 * NEW NEXON
 *
 * In that situation we return selectionRequired.
 *
 * But:
 *
 * "nexon ev 2.0 stock"
 *
 * resolves directly to NEXON EV 2.0.
 *
 * ==================================================
 */


/**
 * ==================================================
 * ENTITY DEFINITIONS
 * ==================================================
 */

const ENTITY_DEFINITIONS = [

    {
        type: "model",
        cacheKey: "models",
        filterPrefix: "model"
    },

    {
        type: "variant",
        cacheKey: "variants",
        filterPrefix: "variant"
    }

];


/**
 * ==================================================
 * NORMALIZATION
 * ==================================================
 */

function normalizeText(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

}


function compact(value) {

    return normalizeText(value)
        .replace(/[^a-z0-9]+/g, "");

}


/**
 * ==================================================
 * GET ENTITY NAME
 * ==================================================
 */

function getEntityName(entity) {

    if (!entity) {
        return "";
    }

    return (

        entity.name ??

        entity.Name ??

        entity.ModelName ??

        entity.VariantName ??

        ""

    );

}


/**
 * ==================================================
 * GET ENTITY UNIQUE ID
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

        entity.id ??

        null

    );

}


/**
 * ==================================================
 * GET ENTITY ALIASES
 * ==================================================
 */

function getEntityAliases(entity) {

    if (!entity) {
        return [];
    }

    if (
        Array.isArray(entity.aliases)
    ) {

        return entity.aliases;

    }

    if (
        Array.isArray(entity.Aliases)
    ) {

        return entity.Aliases;

    }

    return [];

}


/**
 * ==================================================
 * CHECK PHRASE
 * ==================================================
 */

function containsPhrase(
    message,
    phrase
) {

    const text =
        normalizeText(message);

    const value =
        normalizeText(phrase);

    if (!value) {
        return false;
    }

    const escaped =
        value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    return new RegExp(
        `(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`,
        "i"
    ).test(text);

}


/**
 * ==================================================
 * REMOVE BUSINESS WORDS
 * ==================================================
 *
 * Converts:
 *
 * "nexon stock"
 *
 * into:
 *
 * "nexon"
 *
 * Converts:
 *
 * "what is nexon stock"
 *
 * into:
 *
 * "nexon"
 *
 * ==================================================
 */

function cleanEntityQuery(message) {

    return normalizeText(message)
        .replace(
            /\b(stock|inventory|available|availability|vehicle|vehicles|current|show|give|tell|how|many|are|is|the|of|for|today|please|what|do|we|have|in|my)\b/gi,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();

}

/**
 * ==================================================
 * UNIQUE ENTITIES
 * ==================================================
 */

function uniqueEntities(
    entities
) {

    const result = [];

    const seen =
        new Set();

    for (
        const entity
        of entities
    ) {

        const key =
            getEntityUnq(entity) ||
            compact(
                getEntityName(entity)
            );

        if (!key) {
            continue;
        }

        if (
            seen.has(key)
        ) {
            continue;
        }

        seen.add(key);

        result.push(entity);

    }

    return result;

}


/**
 * ==================================================
 * FIND RELATED BASE MODELS
 * ==================================================
 *
 * This is the critical logic.
 *
 * If exact model = NEXON
 *
 * then find:
 *
 * NEXON EV
 * NEXON EV 2.0
 * NEXON EV 3.0
 * NEXON ICNG
 * NEW NEXON
 *
 * ==================================================
 */

function findRelatedModels(
    models,
    exactModel
) {

    if (
        !Array.isArray(models) ||
        !exactModel
    ) {

        return [];

    }

    const exactName =
        normalizeText(
            getEntityName(
                exactModel
            )
        );

    if (!exactName) {
        return [];
    }

    const related = [];

    for (
        const model
        of models
    ) {

        const modelName =
            normalizeText(
                getEntityName(
                    model
                )
            );

        if (!modelName) {
            continue;
        }

        //--------------------------------------------------
        // Same model
        //--------------------------------------------------

        if (
            modelName === exactName
        ) {

            continue;

        }


        //--------------------------------------------------
        // Prefix match
        //
        // NEXON
        // NEXON EV
        // NEXON EV 2.0
        //--------------------------------------------------

        if (
            modelName.startsWith(
                exactName + " "
            )
        ) {

            related.push(
                model
            );

            continue;

        }


        //--------------------------------------------------
        // NEW NEXON
        //--------------------------------------------------

        if (
            modelName ===
            `new ${exactName}`
        ) {

            related.push(
                model
            );

        }

    }

    return uniqueEntities(
        related
    );

}


/**
 * ==================================================
 * FIND MODEL MATCHES
 * ==================================================
 *
 * Returns:
 *
 * {
 *   exact,
 *   matches
 * }
 *
 * ==================================================
 */

function findModelMatches(
    models,
    message
) {

    if (
        !Array.isArray(models)
    ) {

        return {

            exact: null,

            matches: []

        };

    }

    const query =
        cleanEntityQuery(
            message
        );

    if (!query) {

        return {

            exact: null,

            matches: []

        };

    }

    const queryCompact =
        compact(query);


    //--------------------------------------------------
    // 1. Exact model
    //--------------------------------------------------

    let exact =
        null;

    for (
        const model
        of models
    ) {

        const modelName =
            normalizeText(
                getEntityName(
                    model
                )
            );

        const modelCompact =
            compact(
                modelName
            );

        if (
            query === modelName ||
            queryCompact === modelCompact
        ) {

            exact = model;

            break;

        }

    }


    //--------------------------------------------------
    // Exact model found
    //--------------------------------------------------

    if (exact) {

        const related =
            findRelatedModels(
                models,
                exact
            );

        //--------------------------------------------------
        // Base model with related models
        //--------------------------------------------------

        if (
            related.length > 0
        ) {

            return {

                exact,

                matches:
                    uniqueEntities([
                        exact,
                        ...related
                    ])

            };

        }

        //--------------------------------------------------
        // Truly unique exact model
        //--------------------------------------------------

        return {

            exact,

            matches: [
                exact
            ]

        };

    }


    //--------------------------------------------------
    // 2. Partial model search
    //--------------------------------------------------

    const queryWords =
        query
            .split(/\s+/)
            .filter(Boolean);


    const matches = [];


    for (
        const model
        of models
    ) {

        const modelName =
            normalizeText(
                getEntityName(
                    model
                )
            );

        if (!modelName) {
            continue;
        }

        const modelWords =
            modelName.split(
                /\s+/
            );


        //--------------------------------------------------
        // Full query contained in model
        //--------------------------------------------------

        if (
            modelName.includes(
                query
            )
        ) {

            matches.push(
                model
            );

            continue;

        }


        //--------------------------------------------------
        // All query words present
        //--------------------------------------------------

        const allWordsMatch =
            queryWords.every(
                word =>
                    modelWords.some(
                        modelWord =>
                            modelWord === word ||
                            modelWord.startsWith(word)
                    )
            );

        if (
            allWordsMatch
        ) {

            matches.push(
                model
            );

        }

    }


    return {

        exact: null,

        matches:
            uniqueEntities(
                matches
            )

    };

}


/**
 * ==================================================
 * FIND VARIANT MATCHES
 * ==================================================
 */

function findVariantMatches(
    variants,
    message
) {

    if (
        !Array.isArray(variants)
    ) {

        return [];

    }

    const query =
        cleanEntityQuery(
            message
        );

    if (!query) {
        return [];
    }

    const matches = [];

    for (
        const variant
        of variants
    ) {

        const name =
            normalizeText(
                getEntityName(
                    variant
                )
            );

        if (!name) {
            continue;
        }

        //--------------------------------------------------
        // Exact
        //--------------------------------------------------

        if (
            query === name ||
            compact(query) === compact(name)
        ) {

            matches.push(
                variant
            );

            continue;

        }


        //--------------------------------------------------
        // Phrase match
        //--------------------------------------------------

        if (
            containsPhrase(
                query,
                name
            )
        ) {

            matches.push(
                variant
            );

            continue;

        }


        //--------------------------------------------------
        // Partial
        //--------------------------------------------------

        if (
            name.includes(
                query
            )
        ) {

            matches.push(
                variant
            );

        }

    }

    return uniqueEntities(
        matches
    );

}


/**
 * ==================================================
 * BUILD FILTER
 * ==================================================
 */

function buildFilter(
    entityType,
    entity
) {

    if (!entity) {
        return {};
    }

    const unq =
        getEntityUnq(
            entity
        );

    const name =
        getEntityName(
            entity
        );


    if (
        entityType === "model"
    ) {

        return {

            modelUnq:
                unq,

            modelName:
                name

        };

    }


    if (
        entityType === "variant"
    ) {

        return {

            variantUnq:
                unq,

            variantName:
                name

        };

    }


    return {};

}


/**
 * ==================================================
 * FORMAT SELECTION ERROR
 * ==================================================
 *
 * aiRouter already knows how to handle this format.
 *
 * ==================================================
 */

function createSelectionError(
    entityType,
    candidates
) {

    const error =
        new Error(
            `Multiple ${entityType}s matched.`
        );

    error.selectionRequired =
        true;

    error.entityType =
        entityType === "model"
            ? "models"
            : "variants";

    error.options =
        candidates.map(
            item => ({

                unq:
                    getEntityUnq(
                        item
                    ),

                name:
                    getEntityName(
                        item
                    ),

                aliases:
                    getEntityAliases(
                        item
                    )

            })
        );

    return error;

}


/**
 * ==================================================
 * RESOLVE FILTERS
 * ==================================================
 */

async function resolveFiltersDetailed(
    message,
    context
) {

    const database =
        context?.dealership?.database;

    if (!database) {

        throw new Error(
            "Dealership database is missing from AI context."
        );

    }


    //--------------------------------------------------
    // Get dealership cache
    //--------------------------------------------------

  const cache =
    await ensureEntityCache(
        database
    );


    const filters = {};

    const ambiguities = [];
    console.log("======================================");
    console.log("FILTER RESOLVER");
    console.log("MESSAGE:", message);
    console.log(
        "DATABASE:",
        context?.dealership?.database
    );

    //--------------------------------------------------
    // MODEL
    //--------------------------------------------------

    const modelResult =
        findModelMatches(
            cache?.models || [],
            message
        );

    const modelMatches =
        modelResult.matches || [];


    console.log(
        "--------------------------------------"
    );

    console.log(
        "MODEL FILTER RESOLUTION"
    );

    console.log(
        "Message :",
        message
    );

    console.log(
        "Database :",
        database
    );

    console.log(
        "Model query :",
        cleanEntityQuery(message)
    );

    console.log(
        "Model matches :",
        modelMatches.length
    );


    if (
        modelMatches.length > 1
    ) {

        console.log(
            "AMBIGUOUS MODEL"
        );

        console.table(
            modelMatches.map(
                (
                    model,
                    index
                ) => ({

                    option:
                        index + 1,

                    name:
                        getEntityName(
                            model
                        ),

                    unq:
                        getEntityUnq(
                            model
                        )

                })
            )
        );


        ambiguities.push({

            entityType:
                "model",

            cacheKey:
                "models",

            filterPrefix:
                "model",

            candidates:
                modelMatches.map(
                    model => ({

                        unq:
                            getEntityUnq(
                                model
                            ),

                        name:
                            getEntityName(
                                model
                            ),

                        aliases:
                            getEntityAliases(
                                model
                            )

                    })
                )

        });

    }

    else if (
        modelMatches.length === 1
    ) {

        //--------------------------------------------------
        // SAFE MODEL
        //--------------------------------------------------

        Object.assign(
            filters,
            buildFilter(
                "model",
                modelMatches[0]
            )
        );

        console.log(
            "MODEL SELECTED :",
            getEntityName(
                modelMatches[0]
            )
        );

    }


    //--------------------------------------------------
    // VARIANT
    //--------------------------------------------------
    //
    // Only resolve variant when a model is already
    // specifically selected.
    //
    // This prevents unrelated variants from interfering
    // with "nexon stock".
    //--------------------------------------------------

    if (
        filters.modelUnq
    ) {

        const variantMatches =
            findVariantMatches(
                cache?.variants || [],
                message
            );


        if (
            variantMatches.length > 1
        ) {

            console.log(
                "AMBIGUOUS VARIANT"
            );

            console.table(
                variantMatches.map(
                    (
                        variant,
                        index
                    ) => ({

                        option:
                            index + 1,

                        name:
                            getEntityName(
                                variant
                            ),

                        unq:
                            getEntityUnq(
                                variant
                            )

                    })
                )
            );


            ambiguities.push({

                entityType:
                    "variant",

                cacheKey:
                    "variants",

                filterPrefix:
                    "variant",

                candidates:
                    variantMatches.map(
                        variant => ({

                            unq:
                                getEntityUnq(
                                    variant
                                ),

                            name:
                                getEntityName(
                                    variant
                                ),

                            aliases:
                                getEntityAliases(
                                    variant
                                )

                        })
                    )

            });

        }

        else if (
            variantMatches.length === 1
        ) {

            Object.assign(
                filters,
                buildFilter(
                    "variant",
                    variantMatches[0]
                )
            );

            console.log(
                "VARIANT SELECTED :",
                getEntityName(
                    variantMatches[0]
                )
            );

        }

    }


    //--------------------------------------------------
    // LOG
    //--------------------------------------------------

    console.log(
        "FINAL FILTERS"
    );

    console.table(
        filters
    );

    console.log(
        "AMBIGUITIES :",
        ambiguities.length
    );

    console.log(
        "--------------------------------------"
    );


    return {

        filters,

        ambiguities

    };

}


/**
 * ==================================================
 * BACKWARD COMPATIBLE RESOLVE
 * ==================================================
 *
 * IMPORTANT:
 *
 * If ambiguity exists we THROW a special error.
 *
 * aiRouter already understands:
 *
 * selectionRequired
 * options
 *
 * and creates pending selection.
 *
 * ==================================================
 */

async function resolveFilters(
    message,
    context
) {

    const result =
        await resolveFiltersDetailed(
            message,
            context
        );


    //--------------------------------------------------
    // Model ambiguity
    //--------------------------------------------------

    if (
        result.ambiguities?.length
    ) {

        const ambiguity =
            result.ambiguities[0];


        throw createSelectionError(
            ambiguity.entityType,
            ambiguity.candidates
        );

    }


    //--------------------------------------------------
    // Normal filters
    //--------------------------------------------------

    return result.filters;

}


/**
 * ==================================================
 * EXPORTS
 * ==================================================
 */

module.exports = {

    resolveFilters,

    resolveFiltersDetailed,

    findMatches: function (
        list,
        message
    ) {

        const query =
            cleanEntityQuery(
                message
            );

        return (
            Array.isArray(list)
                ? list.filter(
                    entity =>
                        containsPhrase(
                            query,
                            getEntityName(
                                entity
                            )
                        )
                )
                : []
        );

    },

    findModelMatches,

    findVariantMatches,

    cleanEntityQuery

};