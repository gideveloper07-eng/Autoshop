const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a helpful AI assistant for CollegeHub — a college and course discovery app.
You help students with:
- Finding colleges and courses
- Understanding admission processes
- Career guidance and course selection
- Application tips and deadlines
- General academic questions
Be friendly, concise, and helpful.`;

// Per-session chat history stored in memory (keyed by sessionId)
const sessions = {};

exports.chat = async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim())
      return res.status(400).json({ error: "Message is required" });

    const sid = sessionId || "default";
    if (!sessions[sid]) sessions[sid] = [];

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const history = sessions[sid].length > 0
      ? sessions[sid]
      : [
          { role: "user",  parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Understood! I'm ready to help CollegeHub students." }] },
        ];

    const chat  = model.startChat({ history });
    const result = await chat.sendMessage(message.trim());
    const reply  = result.response.text();

    if (sessions[sid].length === 0) {
      sessions[sid] = [
        { role: "user",  parts: [{ text: SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Understood! I'm ready to help CollegeHub students." }] },
      ];
    }

    sessions[sid].push({ role: "user",  parts: [{ text: message.trim() }] });
    sessions[sid].push({ role: "model", parts: [{ text: reply }] });

    // Trim to last 40 entries to avoid token overflow
    if (sessions[sid].length > 40) {
      sessions[sid] = [
        sessions[sid][0],
        sessions[sid][1],
        ...sessions[sid].slice(-38),
      ];
    }

    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error("Agent error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.clearSession = (req, res) => {
  const { sessionId } = req.params;
  if (sessionId && sessions[sessionId]) delete sessions[sessionId];
  res.json({ cleared: true });
};
