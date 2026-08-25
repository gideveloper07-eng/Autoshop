const ai = require("../providers/aiProvider");

/**
 * Generate a structured Morning Dealership Briefing.
 *
 * IMPORTANT:
 * - The AI receives verified SQL facts only.
 * - It must return JSON, not Markdown.
 * - Flutter controls the visual presentation.
 */
async function generateMorningBriefingAI({ summary, priorityAlerts }) {
    const safeSummary = summary || {};
    const safeAlerts = Array.isArray(priorityAlerts)
        ? priorityAlerts.slice(0, 10)
        : [];

    const prompt = `
You are MyAutoShop AI, a dealership business-intelligence assistant.

Create a concise morning management briefing using ONLY the supplied dealership facts.

DEALERSHIP FACTS:
${JSON.stringify({
    summary: safeSummary,
    priorityAlerts: safeAlerts
}, null, 2)}

Return ONLY valid JSON. Do not wrap it in Markdown fences.

Required JSON shape:
{
  "headline": "one concise sentence describing the overall situation",
  "insights": [
    {
      "title": "short issue title",
      "type": "one of HIGH_DEMAND_LOW_STOCK, HIGH_BOOKING_DEMAND, LOW_STOCK, OVERDUE_DELIVERY, SALES_PERFORMANCE",
      "severity": "CRITICAL or HIGH or MEDIUM",
      "issue": "what the supplied facts show",
      "whyItMatters": "brief business implication supported by the facts",
      "recommendedAction": "practical conservative action based only on the facts"
    }
  ]
}

STRICT RULES:
- Use ONLY supplied facts.
- Never invent numbers, models, customers, dates, percentages, stock quantities or booking counts.
- Do not assume a delivery date or reason for an overdue delivery unless supplied.
- Recommendations must be practical and conservative.
- Do not claim a vehicle will definitely be lost/sold unless the facts prove it.
- Do not mention SQL, JSON, API, stored procedures, Gemini, prompts, tools or internal implementation.
- Maximum 5 insights.
- Prefer the most important issues first.
- Keep headline and each field concise and dashboard-friendly.
- If a safe recommendation cannot be determined, say what should be checked.
`;

    const raw = await ai.generate(prompt);

    return parseStructuredBriefing(raw);
}

function parseStructuredBriefing(raw) {
    if (raw && typeof raw === "object") {
        return sanitizeBriefing(raw);
    }

    const text = String(raw || "").trim();

    // Remove accidental Markdown fences.
    const withoutFence = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    let parsed;

    try {
        parsed = JSON.parse(withoutFence);
    } catch (_) {
        // Try extracting the outermost JSON object if the provider
        // added a short sentence before/after it.
        const start = withoutFence.indexOf("{");
        const end = withoutFence.lastIndexOf("}");

        if (start === -1 || end <= start) {
            throw new Error("AI returned non-JSON briefing.");
        }

        parsed = JSON.parse(
            withoutFence.slice(start, end + 1)
        );
    }

    return sanitizeBriefing(parsed);
}

function sanitizeBriefing(value) {
    const source = value && typeof value === "object"
        ? value
        : {};

    const headline =
        String(source.headline || "").trim();

    const allowedTypes = new Set([
        "HIGH_DEMAND_LOW_STOCK",
        "HIGH_BOOKING_DEMAND",
        "LOW_STOCK",
        "OVERDUE_DELIVERY",
        "SALES_PERFORMANCE"
    ]);

    const allowedSeverity = new Set([
        "CRITICAL",
        "HIGH",
        "MEDIUM"
    ]);

    const insights = Array.isArray(source.insights)
        ? source.insights
            .slice(0, 5)
            .map((item) => {
                const insight = item || {};

                const type = String(
                    insight.type || "HIGH"
                ).toUpperCase();

                const severity = String(
                    insight.severity || "HIGH"
                ).toUpperCase();

                return {
                    title:
                        String(
                            insight.title || "Dealership attention"
                        ).trim(),

                    type:
                        allowedTypes.has(type)
                            ? type
                            : "HIGH_BOOKING_DEMAND",

                    severity:
                        allowedSeverity.has(severity)
                            ? severity
                            : "HIGH",

                    issue:
                        String(
                            insight.issue || ""
                        ).trim(),

                    whyItMatters:
                        String(
                            insight.whyItMatters || ""
                        ).trim(),

                    recommendedAction:
                        String(
                            insight.recommendedAction || ""
                        ).trim()
                };
            })
            .filter(
                item =>
                    item.issue ||
                    item.whyItMatters ||
                    item.recommendedAction
            )
        : [];

    if (!headline && insights.length === 0) {
        throw new Error("AI returned an empty structured briefing.");
    }

    return {
        headline:
            headline ||
            "Your dealership has items that need attention today.",

        insights
    };
}

module.exports = {
    generateMorningBriefingAI
};
