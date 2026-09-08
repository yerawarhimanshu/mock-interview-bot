require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Groq = require("groq-sdk");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Groq
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.warn("⚠️ Warning: GROQ_API_KEY is not set.");
}
const groq = new Groq({ apiKey });

// Interview endpoint
app.post("/api/interview", async (req, res) => {
  try {
    const { prompt, topic, history } = req.body;

    const messages = [
      {
        role: "system",
        content: `You are an expert technical interviewer for ${topic || "Software Engineering"}. Evaluate the candidate's answer constructively, give brief feedback, and then ask the next question.`
      }
    ];

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((msg) => {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content
        });
      });
    }

    messages.push({ role: "user", content: prompt });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024
    });

    const responseText = completion.choices[0]?.message?.content || "No response generated.";
    return res.json({ response: responseText });
  } catch (error) {
    console.error("Groq API Error:", error);
    return res.status(500).json({
      error: "Failed to generate AI response",
      details: error.message || error.toString()
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
