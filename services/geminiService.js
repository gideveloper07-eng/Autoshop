const { GoogleGenAI } = require("@google/genai");
const { executeTool } = require("./toolRegistry");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_PROMPT = require("../prompts/systemPrompt");

const functionDeclarations = [
  {
    name: "getTodayBookings",
    description: "Returns today's bookings.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
];

async function askGemini(message) {
  let response = await ai.models.generateContent({
    model: "gemini-3.5-flash",

    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\n${message}`,
          },
        ],
      },
    ],

    config: {
      tools: [
        {
          functionDeclarations,
        },
      ],
    },
  });

  while (true) {
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    const functionPart = parts.find((p) => p.functionCall);

    if (!functionPart) {
      return response.text;
    }

    const { name, args } = functionPart.functionCall;

    const toolResult = await executeTool(name, args);

    response = await ai.models.generateContent({
      model: "gemini-3.5-flash",

      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\n${message}`,
            },
          ],
        },
        {
          role: "model",
          parts,
        },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name,
                response: toolResult,
              },
            },
          ],
        },
      ],

      config: {
        tools: [
          {
            functionDeclarations,
          },
        ],
      },
    });
  }
}

module.exports = {
  askGemini,
};