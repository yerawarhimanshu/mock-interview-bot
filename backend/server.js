require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Groq = require("groq-sdk");

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json());

// 2. Serve Static Frontend Files (only if directory exists)
const frontendPath = path.join(__dirname, "../frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// 3. Initialize Groq Client
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.warn("⚠️ Warning: GROQ_API_KEY is not set.");
}
const groq = new Groq({ apiKey: apiKey || "" });

// 4. API Endpoint for Interview & Mentor Chat
app.post("/api/interview", async (req, res) => {
  try {
    const { prompt, history, topic, difficulty } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "A prompt is required." });
    }

    const currentTopic = topic || "the selected technical topic";
    const currentDifficulty = difficulty || "Intermediate";

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

    const messages = [{ role: "system", content: systemInstruction }];

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((msg) => {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      });
    }

    messages.push({ role: "user", content: prompt });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const responseText =
      completion.choices[0]?.message?.content || "No response generated.";

    return res.json({ response: responseText });
  } catch (error) {
    console.error("Groq API Error:", error);
    return res.status(500).json({
      error: "Failed to generate AI response",
      details: error.message,
    });
  }
});

// 5. Fallback Route
app.use((req, res) => {
  const indexPath = path.join(__dirname, "../frontend", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send("API server is running.");
  }
});

// 6. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
