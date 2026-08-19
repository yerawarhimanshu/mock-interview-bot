require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json());

// 2. Serve Static Frontend Files (HTML, CSS, JS) from frontend folder
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
    const { prompt, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "A prompt is required." });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

// 6. Start Server on dynamic Port
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});