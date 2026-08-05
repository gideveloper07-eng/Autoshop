const aliases = require("../config/aliases");

function normalizeText(text) {

    let normalized =
        text.toLowerCase();

    Object.entries(aliases).forEach(([canonical, words]) => {

        words.forEach(word => {

            const regex =
                new RegExp(`\\b${word}\\b`, "gi");

            normalized =
                normalized.replace(regex, canonical);

        });

    });

    return normalized;

}

function calculateScore(text, pattern) {

    let score = 0;

    pattern.forEach(word => {

        if (text.includes(word))
            score++;

    });

    return score;

}

function matchIntent(text, intents) {

    const normalized =
        normalizeText(text);

    let best = null;

    let bestScore = 0;

    intents.forEach(intent => {

        intent.patterns.forEach(pattern => {

            const score =
                calculateScore(
                    normalized,
                    pattern
                );

            if (
                score === pattern.length &&
                score > bestScore
            ) {

                bestScore = score;

                best = intent;

            }

        });

    });

    return best;

}

module.exports = {

    matchIntent,

    normalizeText

};