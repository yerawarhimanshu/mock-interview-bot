require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json());

// 2. Serve Static Frontend Files from frontend folder
app.use(express.static(path.join(__dirname, "../frontend")));

// 3. Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ Warning: GEMINI_API_KEY is not set.");
}
const genAI = new GoogleGenerativeAI(apiKey || "");

// 4. API Endpoint for Interview & Mentor Chat
app.post("/api/interview", async (req, res) => {
  try {
    const { prompt, history, topic, difficulty } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "A prompt is required." });
    }

    const currentTopic = topic || "the selected technical topic";
    const currentDifficulty = difficulty || "Intermediate";

    // System instructions enforcing strict technical evaluation & topic lock
    const systemInstruction = `
You are a rigorous, professional technical interviewer.
Current Session Details:
- Target Domain: ${currentTopic}
- Difficulty: ${currentDifficulty}

RULES YOU MUST FOLLOW:
1. TOPIC RELEVANCE:
   Every question you ask MUST strictly belong to "${currentTopic}".
   If the topic is "DSA (Data Structures & Algorithms)", ask ONLY about data structures (arrays, trees, graphs, heaps, hash tables) and algorithms (sorting, recursion, dynamic programming, two pointers, time/space complexity). NEVER ask about Redis, Node.js, CSS, or system design unless specified by the topic.

2. ACCURATE EVALUATION (NO FALSE PRAISE):
   Carefully examine the candidate's response:
   - If the candidate types gibberish, random letters (e.g., "SEDFG'['", "asdfgh"), empty text, or completely unrelated remarks:
     DO NOT say "Well stated", "Good attempt", or "Evaluation noted".
     Directly say: "Your response is invalid and does not address the question." and score it 0.
   - If the candidate says "I don't know":
     Directly note that no answer was provided and proceed.
   - If the candidate provides a real technical answer:
     Provide 1-2 sentences of honest, specific critique (state what was accurate and what was missing).

3. TRANSITION TO NEXT QUESTION:
   After your brief critique, clearly present the next question for the candidate.
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
    });

    let contextText = "";
    if (Array.isArray(history) && history.length > 0) {
      contextText =
        "Previous conversation context:\n" +
        history
          .map(
            (msg) =>
              `${msg.role === "user" ? "Candidate" : "Interviewer/Mentor"}: ${msg.content}`
          )
          .join("\n") +
        "\n\nCurrent Task:\n";
    }

    const fullPrompt = contextText + prompt;
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();

    return res.json({ response: responseText });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({
      error: "Failed to generate AI response",
      details: error.message,
    });
  }
});

// 5. Fallback Route: Serve index.html for any other route
app.get("(.*)", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

// 6. Start Server on dynamic Port
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});