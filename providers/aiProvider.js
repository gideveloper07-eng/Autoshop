const groq = require("./groqProvider");
// const gemini = require("./geminiProvider");
// const ollama = require("./ollamaProvider");

const provider = process.env.AI_PROVIDER || "groq";

switch (provider.toLowerCase()) {

    case "groq":
        module.exports = groq;
        break;

    // case "gemini":
    //     module.exports = gemini;
    //     break;

    // case "ollama":
    //     module.exports = ollama;
    //     break;

    default:
        module.exports = groq;

}