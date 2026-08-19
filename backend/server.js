require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("FATAL: GEMINI_API_KEY is missing in your .env file.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Fast low-latency model pool
const fastModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-8b",
  generationConfig: {
    maxOutputTokens: 250,
    temperature: 0.1,
  },
});

const backupModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    maxOutputTokens: 250,
    temperature: 0.1,
  },
});

// Emergency questions in case daily quotas are reached
const emergencyQuestions = [
  "Good attempt. Can you explain how you would optimize database queries and handle connection pooling in a high-concurrency Node.js service?",
  "Understood. Moving to the next technical topic: Explain how B-Tree indexes work under the hood in databases and when an index degrades write performance.",
  "Let's move forward: How do you design and secure a distributed caching strategy using Redis to prevent cache stampedes?",
  "Well stated. How do you handle race conditions and cancel pending asynchronous requests on the frontend using AbortController?"
];
let fallbackIdx = 0;

async function getFastResponse(promptText) {
  try {
    const result = await fastModel.generateContent(promptText);
    const response = await result.response;
    return response.text();
  } catch (primaryErr) {
    console.warn("Primary 8b model busy, switching to backup flash model...");
    try {
      const backupResult = await backupModel.generateContent(promptText);
      const backupResponse = await backupResult.response;
      return backupResponse.text();
    } catch (backupErr) {
      console.warn("Quota reached or server busy. Using offline fallback response...");
      const q = emergencyQuestions[fallbackIdx % emergencyQuestions.length];
      fallbackIdx++;
      return `Evaluation noted. Next Question: ${q}`;
    }
  }
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/interview', async (req, res) => {
  const { prompt, history, answer, message } = req.body;
  const inputPayload = prompt || answer || message || (history ? JSON.stringify(history) : "Hello, let's begin.");

  const aiText = await getFastResponse(inputPayload);

  return res.status(200).json({
    success: true,
    response: aiText,
    message: aiText,
    text: aiText
  });
});

app.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`  Fast Interview Backend Running on Port ${PORT}`);
  console.log(`  Endpoint: http://localhost:${PORT}/api/interview`);
  console.log(`==============================================\n`);
});