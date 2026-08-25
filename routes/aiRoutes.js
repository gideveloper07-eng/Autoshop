const express = require("express");
const router = express.Router();

const sql = require("mssql");

const { verifyToken } = require("../middleware/authMiddleware");
const aiController = require("../controllers/aiController");
const { generateMorningBriefingAI } = require("../services/morningBriefingAI");

// ==================================================
// AI CHAT
// Existing route - DO NOT CHANGE
// ==================================================

router.post(
    "/chat",
    verifyToken,
    aiController.chat
);


// ==================================================
// AI CONVERSATION HISTORY
// ==================================================

router.get(
    "/conversations",
    verifyToken,
    aiController.listConversations
);

router.get(
    "/conversations/:conversationId",
    verifyToken,
    aiController.getConversation
);

router.post(
    "/conversations",
    verifyToken,
    aiController.createConversation
);

router.delete(
    "/conversations/:conversationId",
    verifyToken,
    aiController.deleteConversation
);


// ==================================================
// AI MORNING DEALERSHIP BRIEFING
// ==================================================
//
// GET /api/ai/morning-briefing?databaseName=TATADEMO
//
// Phase 1:
//   SQL facts
//
// Phase 2:
//   SQL facts + AI interpretation
//
// ==================================================

const briefingCache = new Map();

const BRIEFING_CACHE_MS = 30 * 60 * 1000; // 30 minutes


function cacheKey(databaseName) {
    return String(databaseName || "").trim().toUpperCase();
}


function getSeverityRank(value) {
    const rank = {
        CRITICAL: 1,
        HIGH: 2,
        MEDIUM: 3,
        NORMAL: 4
    };

    return rank[String(value || "").toUpperCase()] || 99;
}


function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}


function normalizeAlert(row) {
    return {
        type: row.AlertType || null,
        severity: row.Severity || null,

        modelUnq: row.ModelUnq || null,
        model: row.ModelName || null,

        customerUnq: row.CustomerUnq || null,
        customerName: row.CustomerName || null,
        variant: row.VariantName || null,

        bookingCount: toNumber(row.BookingCount),
        stockFree: toNumber(row.StockFree),
        stockThreshold: toNumber(row.StockThreshold),
        stockShortage: toNumber(row.StockShortage),
        demandStockGap: toNumber(row.DemandStockGap),

        expectedDeliveryDate: row.ExpectedDeliveryDate || null,
        daysOverdue: toNumber(row.DaysOverdue),

        todaySales: toNumber(row.TodaySales),
        previousSevenDaySales: toNumber(row.PreviousSevenDaySales),
        sevenDayAverageSales: toNumber(row.SevenDayAverageSales),
        salesDropPercent: toNumber(row.SalesDropPercent),
        todaySalesValue: toNumber(row.TodaySalesValue),
        previousSevenDaySalesValue:
            toNumber(row.PreviousSevenDaySalesValue)
    };
}


router.get(
    "/morning-briefing",
    verifyToken,
    async (req, res) => {

        let dynamicPool = null;

        try {

            const databaseName =
                String(req.query.databaseName || "").trim();

            if (!databaseName) {
                return res.status(400).json({
                    success: false,
                    message: "databaseName is required"
                });
            }

            console.log("");
            console.log("==============================================");
            console.log("🤖 AI MORNING BRIEFING - PHASE 2");
            console.log("==============================================");
            console.log("Database:", databaseName);


            // ==================================================
            // DATABASE CONNECTION
            // ==================================================

            dynamicPool =
                await new sql.ConnectionPool({

                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    server: process.env.DB_HOST,

                    port:
                        parseInt(
                            process.env.DB_PORT || "1433"
                        ),

                    database: databaseName,

                    options: {
                        encrypt: false,
                        trustServerCertificate: true
                    }

                }).connect();


            console.log(
                "✅ Connected to:",
                databaseName
            );


            // ==================================================
            // SQL FACTS
            // ==================================================

            const result =
                await dynamicPool
                    .request()
                    .input(
                        "what",
                        sql.NVarChar(50),
                        "AIMorningBriefing"
                    )
                    .execute(
                        "A_SP_FOR_ApplicationChallangrid"
                    );


            const rows =
                result.recordset || [];


            console.log(
                "📊 Morning briefing SQL rows:",
                rows.length
            );


            // ==================================================
            // NORMALIZE
            // ==================================================

            const alerts =
                rows.map(normalizeAlert);


            // ==================================================
            // SUMMARY
            // ==================================================

            const summary = {

                totalAlerts:
                    alerts.length,

                critical:
                    alerts.filter(
                        x =>
                            String(x.severity || "")
                                .toUpperCase() === "CRITICAL"
                    ).length,

                high:
                    alerts.filter(
                        x =>
                            String(x.severity || "")
                                .toUpperCase() === "HIGH"
                    ).length,

                medium:
                    alerts.filter(
                        x =>
                            String(x.severity || "")
                                .toUpperCase() === "MEDIUM"
                    ).length,

                normal:
                    alerts.filter(
                        x =>
                            String(x.severity || "")
                                .toUpperCase() === "NORMAL"
                    ).length,

                lowStock:
                    alerts.filter(
                        x =>
                            x.type === "LOW_STOCK"
                    ).length,

                overdueDeliveries:
                    alerts.filter(
                        x =>
                            x.type === "OVERDUE_DELIVERY"
                    ).length,

                salesPerformance:
                    alerts.filter(
                        x =>
                            x.type === "SALES_PERFORMANCE"
                    ).length,

                highBookingDemand:
                    alerts.filter(
                        x =>
                            x.type === "HIGH_BOOKING_DEMAND"
                    ).length,

                highDemandLowStock:
                    alerts.filter(
                        x =>
                            x.type === "HIGH_DEMAND_LOW_STOCK"
                    ).length
            };


            // ==================================================
            // PRIORITY SORT
            // ==================================================

            alerts.sort((a, b) => {

                const severityDifference =
                    getSeverityRank(a.severity) -
                    getSeverityRank(b.severity);

                if (severityDifference !== 0) {
                    return severityDifference;
                }

                const gapDifference =
                    Number(b.demandStockGap || 0) -
                    Number(a.demandStockGap || 0);

                if (gapDifference !== 0) {
                    return gapDifference;
                }

                return (
                    Number(b.daysOverdue || 0) -
                    Number(a.daysOverdue || 0)
                );
            });


            const priorityAlerts =
                alerts.slice(0, 10);


            // ==================================================
            // AI INTERPRETATION
            // ==================================================

            const key =
                cacheKey(databaseName);

            const cached =
                briefingCache.get(key);

            const now =
                Date.now();

            let aiBriefing = null;
            let aiSource = "ai";
            let aiGeneratedAt = null;


            if (
                cached &&
                cached.expiresAt > now
            ) {

                aiBriefing =
                    cached.aiBriefing;

                aiGeneratedAt =
                    cached.aiGeneratedAt;

                console.log(
                    "♻️ Using cached AI briefing"
                );

            } else {

                try {

                    aiBriefing =
                        await generateMorningBriefingAI({
                            summary,
                            priorityAlerts
                        });

                    aiGeneratedAt =
                        new Date().toISOString();


                    briefingCache.set(
                        key,
                        {
                            aiBriefing,
                            aiGeneratedAt,
                            expiresAt:
                                now +
                                BRIEFING_CACHE_MS
                        }
                    );


                    console.log(
                        "🧠 New AI briefing generated"
                    );

                } catch (aiError) {

                    console.error(
                        "⚠️ AI briefing generation failed:",
                        aiError.message
                    );


                    // ------------------------------------------------
                    // SAFE FALLBACK
                    // ------------------------------------------------
                    //
                    // The dashboard still receives verified facts.
                    // No invented AI statements are returned.
                    // ------------------------------------------------

                    aiSource = "rule_based_fallback";

                    aiBriefing =
                        buildFallbackBriefing(
                            summary,
                            priorityAlerts
                        );

                    aiGeneratedAt =
                        new Date().toISOString();
                }
            }


            // ==================================================
            // RESPONSE
            // ==================================================

            return res.json({

                success: true,

                databaseName,

                generatedAt:
                    new Date().toISOString(),

                summary,

                ai: {
                    available:
                        aiSource === "ai",

                    source:
                        aiSource,

                    generatedAt:
                        aiGeneratedAt,

                    briefing:
                        aiBriefing
                },

                priorityAlerts,

                alerts

            });


        } catch (error) {

            console.error("");
            console.error(
                "❌ AI MORNING BRIEFING ERROR:",
                error
            );
            console.error("");


            return res.status(500).json({

                success: false,

                message:
                    "Failed to generate AI morning briefing",

                error:
                    error.message

            });


        } finally {

            if (dynamicPool) {

                try {
                    await dynamicPool.close();
                } catch (closeError) {

                    console.error(
                        "❌ Error closing briefing DB connection:",
                        closeError.message
                    );

                }

            }

        }

    }
);


// ==================================================
// SAFE NON-AI FALLBACK
// ==================================================

function buildFallbackBriefing(summary, priorityAlerts) {
    const insights = [];

    const addInsight = ({
        title,
        type,
        severity,
        issue,
        whyItMatters,
        recommendedAction
    }) => {
        if (insights.length >= 5) return;

        insights.push({
            title,
            type,
            severity,
            issue,
            whyItMatters,
            recommendedAction
        });
    };

    const topDemandLowStock =
        (priorityAlerts || []).find(
            x => x.type === "HIGH_DEMAND_LOW_STOCK"
        );

    if (topDemandLowStock) {
        addInsight({
            title:
                topDemandLowStock.model
                    ? `${topDemandLowStock.model} — high demand, low stock`
                    : "High demand with insufficient stock",
            type: "HIGH_DEMAND_LOW_STOCK",
            severity:
                String(topDemandLowStock.severity || "HIGH").toUpperCase(),
            issue:
                `${topDemandLowStock.bookingCount ?? 0} bookings with ` +
                `${topDemandLowStock.stockFree ?? 0} units available.`,
            whyItMatters:
                "Booking demand is higher than available stock for this model.",
            recommendedAction:
                "Check incoming inventory and review allocation for existing bookings."
        });
    }

    if (summary.overdueDeliveries > 0) {
        addInsight({
            title: "Overdue deliveries need follow-up",
            type: "OVERDUE_DELIVERY",
            severity: "CRITICAL",
            issue:
                `${summary.overdueDeliveries} delivery alert` +
                `${summary.overdueDeliveries === 1 ? "" : "s"} are overdue.`,
            whyItMatters:
                "Delayed deliveries can require immediate customer follow-up.",
            recommendedAction:
                "Review overdue cases and confirm the latest delivery status."
        });
    }

    if (summary.lowStock > 0) {
        addInsight({
            title: "Low-stock inventory needs attention",
            type: "LOW_STOCK",
            severity: "HIGH",
            issue:
                `${summary.lowStock} low-stock alert` +
                `${summary.lowStock === 1 ? "" : "s"} detected.`,
            whyItMatters:
                "Available inventory is below the configured threshold for affected models.",
            recommendedAction:
                "Review affected models and check replenishment or incoming stock."
        });
    }

    if (summary.salesPerformance > 0) {
        addInsight({
            title: "Sales performance needs attention",
            type: "SALES_PERFORMANCE",
            severity: "CRITICAL",
            issue:
                "The stored dealership sales-performance alert requires attention.",
            whyItMatters:
                "Today's sales performance is below the recent comparison used by the dealership alert.",
            recommendedAction:
                "Review today's sales activity against the recent trend."
        });
    }

    const topBookingDemand =
        (priorityAlerts || []).find(
            x =>
                x.type === "HIGH_BOOKING_DEMAND" &&
                x.type !== "HIGH_DEMAND_LOW_STOCK"
        );

    if (topBookingDemand) {
        addInsight({
            title:
                topBookingDemand.model
                    ? `${topBookingDemand.model} — strong booking demand`
                    : "Strong booking demand",
            type: "HIGH_BOOKING_DEMAND",
            severity:
                String(topBookingDemand.severity || "HIGH").toUpperCase(),
            issue:
                `${topBookingDemand.bookingCount ?? 0} bookings with ` +
                `${topBookingDemand.stockFree ?? 0} units available.`,
            whyItMatters:
                "Booking activity is elevated for this model.",
            recommendedAction:
                "Review booking pipeline and available stock for this model."
        });
    }

    return {
        headline:
            summary.totalAlerts > 0
                ? `Your dealership has ${summary.totalAlerts} alerts that need attention today.`
                : "Nothing urgent needs your attention today.",
        insights
    };
}

// Export the Express router so server.js can mount it with app.use().
module.exports = router;
