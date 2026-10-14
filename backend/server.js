require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Groq API
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.warn("Warning: GROQ_API_KEY is not set.");
}

const groq = new Groq({
  apiKey: apiKey || "missing-api-key",
});

// Interview endpoint
app.post("/api/interview", async (req, res) => {
  try {
    const { prompt, topic, history, difficulty } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Please provide an interview question or answer.",
      });
    }

    const currentTopic = topic || "Software Engineering";
    const currentDifficulty = difficulty || "Medium";

    const systemInstruction = `
You are a professional technical interviewer.

Interview topic: ${currentTopic}
Difficulty: ${currentDifficulty}

Instructions:
1. Ask questions relevant to the specified topic.
2. Evaluate the candidate's answer honestly.
3. If the answer is incorrect, explain the mistake briefly.
4. If the answer is invalid or unrelated, clearly say so.
5. Give concise, constructive feedback.
6. Ask the next relevant interview question.
`;

    const messages = [
      {
        role: "system",
        content: systemInstruction,
      },
    ];

    if (Array.isArray(history)) {
      history.forEach((msg) => {
        if (
          msg &&
          typeof msg.content === "string" &&
          ["user", "assistant"].includes(msg.role)
        ) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      });
    }

    messages.push({
      role: "user",
      content: prompt,
    });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const responseText =
      completion.choices[0]?.message?.content ||
      "No response generated.";

    return res.json({
      response: responseText,
    });
  } catch (error) {
    console.error("AI API Error:", error.message || error);

    return res.status(500).json({
      error: "Failed to generate AI response",
    });
  }
});

// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});