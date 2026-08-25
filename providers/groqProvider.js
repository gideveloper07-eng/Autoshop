const OpenAI = require("openai");

console.log("========== GROQ CONFIG ==========");
console.log(
    "GROQ API KEY:",
    process.env.GROQ_API_KEY
        ? process.env.GROQ_API_KEY.substring(0, 8) + "..."
        : "NOT FOUND"
);
console.log(
    "GROQ MODEL:",
    process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
);
console.log("=================================");

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

async function generate(prompt) {

    const model =
        process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    console.log("GROQ REQUEST MODEL:", model);

    const completion =
        await client.chat.completions.create({

            model: model,

            temperature: 0.2,

            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]

        });

    return completion.choices[0].message.content;
}

module.exports = {
    generate
};