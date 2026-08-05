const OpenAI = require("openai");

const client = new OpenAI({

    apiKey: process.env.GROQ_API_KEY,

    baseURL: "https://api.groq.com/openai/v1"

});

async function generate(prompt) {

    const completion =
        await client.chat.completions.create({

            model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",

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