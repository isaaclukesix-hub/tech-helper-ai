require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const multer = require("multer");
const path = require("path");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const systemMessage = {
  role: "system",
  content: `
You are LogiFix, an expert IT support technician.

You deeply understand:
- iPhones, Android phones, Windows, Mac
- WiFi, Bluetooth, apps, settings, hardware issues

Your job is to:
- Diagnose problems step-by-step
- Identify the MOST likely cause first
- Ask targeted questions
- Guide users like a real technician

RULES:

1. THINK LIKE A TECHNICIAN
- Always consider multiple causes
- Start with the most likely one

2. STEP-BY-STEP ONLY
- Give ONLY 1–2 steps at a time
- Wait for user response before continuing

3. BE SPECIFIC
- Mention exact paths:
  Example: "Go to Settings > WiFi"

4. USE IMAGES WHEN PROVIDED
- If a screenshot/photo is included:
  - Analyze what is visible
  - Reference specific elements in the image
  - Use it to narrow the issue

5. ASK FOLLOW-UP QUESTIONS
- Example:
  "Do you see your WiFi network listed there?"

6. NO GENERIC ADVICE
- Do NOT say "try restarting" unless justified
- Do NOT say "let me know if that works"

7. KEEP RESPONSES SHORT, CLEAR, AND CONFIDENT

EXAMPLE:

User: "My WiFi isn't working"

Good response:
"First, check if your phone is still connected to your WiFi network. Go to Settings > WiFi. Do you see your network listed and connected?"
`
};

app.post("/api/chat", upload.single("image"), async (req, res) => {
  let messages;
  try {
    // FormData sends everything as strings; JSON body also accepted
    messages = typeof req.body.messages === "string"
      ? JSON.parse(req.body.messages)
      : req.body.messages;
  } catch {
    return res.status(400).json({ reply: "Invalid messages format" });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ reply: "Invalid messages format" });
  }

  let historyMessages = messages.slice(-20);

  // If an image was uploaded, inject it into the last user message
  if (req.file) {
    const base64 = req.file.buffer.toString("base64");
    const mime = req.file.mimetype || "image/png";
    const last = historyMessages[historyMessages.length - 1];
    const textContent = (typeof last.content === "string" ? last.content : "Please help me with this image.")
      + " Use the image to help diagnose the issue.";

    historyMessages = [
      ...historyMessages.slice(0, -1),
      {
        role: "user",
        content: [
          { type: "text", text: textContent },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ];
  }

  const finalMessages = [
    systemMessage,
    ...historyMessages,
  ];

  console.log("Sending messages:", JSON.stringify(finalMessages, null, 2));

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: finalMessages,
      max_tokens: 400,
      temperature: 0.5,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error("FULL ERROR:", err);
    if (err.response) {
      console.error("API RESPONSE:", err.response.data);
    }
    res.status(500).json({ reply: "Server error. Check logs." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.send("Server OK");
});

// Handle multer file-size errors
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ reply: "Image too large. Please use a file under 5 MB." });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ reply: "Server error." });
});

app.listen(PORT, () => {
  console.log("Tech Helper AI is running!");
  console.log("Open your browser: http://localhost:" + PORT);
});