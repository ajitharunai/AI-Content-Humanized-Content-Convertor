// server.js
// =========================================
// AI → Humanized Content Studio backend
// Node + Express + OpenAI / Gemini wiring
// =========================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Optional: OpenAI + Gemini, only used if keys are present
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve static frontend from /public (or root in this flat structure, but user asked for public/ structure in plan description, 
// however the user's file list in prompt 54 implies flat structure or public folder. 
// "Folder structure: project-root/ server.js ... public/ ai-humanizer.html ..."
// BUT the user's current workspace is flat: c:\Users\admin\Desktop\Calculator web app\
// I will serve static files from the CURRENT directory for simplicity unless I move them.
// The user said "Save this as ai-humanizer.html in the same folder where styles.css already lives."
// So I will serve the current directory as static.)
app.use(express.static(__dirname));

// Helpers
function simpleReadabilityScore(text) {
    if (!text) return 0;
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length || 1;

    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const sentenceCount = sentences.length || 1;

    const avgSentenceLength = wordCount / sentenceCount;

    const buzzwords = [
        "leverage",
        "unlock",
        "synergy",
        "cutting-edge",
        "state-of-the-art",
        "revolutionize",
        "robust",
        "at scale",
        "best-in-class"
    ];

    const lower = text.toLowerCase();
    let buzzCount = 0;
    buzzwords.forEach((b) => {
        if (lower.includes(b)) buzzCount += 1;
    });

    let score = 100;
    if (avgSentenceLength > 25) {
        score -= Math.min(40, (avgSentenceLength - 25) * 2);
    }
    score -= Math.min(30, buzzCount * 6);

    score = Math.max(0, Math.min(100, Math.round(score)));
    return score;
}

// Very light rule-based fallback if no model provider is configured
function fallbackHumanize(text) {
    if (!text) return "";

    let out = text.trim();
    out = out.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    out = out.replace(/ {2,}/g, " ");

    const pairs = [
        [/cutting-edge/gi, "advanced"],
        [/state-of-the-art/gi, "modern"],
        [/leverage/gi, "use"],
        [/utili[sz]e/gi, "use"],
        [/in order to/gi, "to"],
        [/synergy/gi, "working together"],
        [/unlock value/gi, "get results"]
    ];

    pairs.forEach(([pattern, replacement]) => {
        out = out.replace(pattern, replacement);
    });

    return out;
}

// Core API: /api/humanize
app.post("/api/humanize", async (req, res) => {
    try {
        const {
            text,
            tone = "neutral",
            length = "original",
            seoKeywords = [],
            contentType = "blog"
        } = req.body || {};

        if (!text || typeof text !== "string" || !text.trim()) {
            return res.status(400).json({
                error: "Missing or empty 'text' field"
            });
        }

        // Basic length guard (you can adjust)
        const charLen = text.length;
        if (charLen > 12000) {
            return res.status(413).json({
                error: "Input too long. Please reduce to <= 12,000 characters."
            });
        }

        const provider = (process.env.MODEL_PROVIDER || "").toLowerCase();

        // If no provider configured, use local fallback
        if (!provider || provider === "none") {
            const output = fallbackHumanize(text);
            const readabilityScore = simpleReadabilityScore(output);
            return res.json({
                provider: "fallback-local",
                output,
                variantA: output,
                variantB: output,
                variantC: output,
                readabilityScore
            });
        }

        // Shared instruction (important: explicitly forbid bypass/detector use)
        const systemInstruction = `
You are an editing assistant that rewrites AI-generated drafts into clearer, more human-sounding content.
Your goals:
1. Improve clarity, flow, and readability.
2. Respect the requested tone and length (neutral, casual, formal; shorter, original, longer).
3. Preserve important domain terms and SEO keywords when provided.
4. Do NOT attempt to "bypass" AI-detection tools or guarantee that text is undetectable as AI.
5. Always maintain accuracy and avoid hallucinating facts.
6. Do not copy from copyrighted sources. Only work with the user's text.
Return your answer as a compact JSON object with this shape:

{
  "output": "main humanized version as a multi-paragraph string",
  "variantA": "shorter alternative",
  "variantB": "more conversational alternative if tone allows",
  "variantC": "bullet-style summary or key points",
  "readabilityScore": 0-100
}
`.trim();

        const userInstruction = `
Rewrite the following text.

Constraints:
- Content type: ${contentType}
- Tone: ${tone} (neutral, casual, or formal).
- Length: ${length} (shorter, original, or longer).
- SEO keywords to preserve (if they appear in source): ${Array.isArray(seoKeywords) ? seoKeywords.join(", ") : ""}

Instructions:
- You may reorganize sentences for clarity.
- Avoid heavy buzzwords and exaggerated marketing language.
- Use paragraph breaks suitable for the content type (${contentType}, e.g., blogs vs LinkedIn vs email).
- Do not add new factual claims not present in the original.

Source text:
"""${text.trim()}"""
`.trim();

        let modelResponseJson = null;

        if (provider === "openai") {
            // ============ OPENAI BRANCH ============
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error("OPENAI_API_KEY not configured");
            }

            const openai = new OpenAI({ apiKey });

            const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

            const completion = await openai.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: userInstruction }
                ],
                temperature: 0.5
            });

            const raw = completion.choices?.[0]?.message?.content || "";
            try {
                modelResponseJson = JSON.parse(raw);
            } catch (err) {
                // If model returned natural language instead of JSON, wrap it
                modelResponseJson = {
                    output: raw.trim(),
                    variantA: raw.trim(),
                    variantB: raw.trim(),
                    variantC: raw.trim(),
                    readabilityScore: simpleReadabilityScore(raw)
                };
            }
        } else if (provider === "gemini") {
            // ============ GEMINI BRANCH ============
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("GEMINI_API_KEY not configured");
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const modelName = process.env.GEMINI_MODEL || "gemini-1.5-pro";
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent([
                systemInstruction,
                "\n\n---\n\n",
                userInstruction
            ]);

            const raw =
                result.response?.text?.() ||
                result.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
                "";

            let cleanRaw = raw.trim();
            // Strip markdown code blocks if present
            if (cleanRaw.startsWith("```")) {
                cleanRaw = cleanRaw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
            }

            try {
                modelResponseJson = JSON.parse(cleanRaw);
            } catch (err) {
                modelResponseJson = {
                    output: raw.trim(),
                    variantA: raw.trim(),
                    variantB: raw.trim(),
                    variantC: raw.trim(),
                    readabilityScore: simpleReadabilityScore(raw)
                };
            }
        } else {
            // Unknown provider -> use fallback
            const output = fallbackHumanize(text);
            const readabilityScore = simpleReadabilityScore(output);
            return res.json({
                provider: "fallback-local",
                output,
                variantA: output,
                variantB: output,
                variantC: output,
                readabilityScore
            });
        }

        // Normalise model output
        const output = String(modelResponseJson.output || "").trim();
        const variantA = String(modelResponseJson.variantA || output).trim();
        const variantB = String(modelResponseJson.variantB || output).trim();
        const variantC = String(modelResponseJson.variantC || output).trim();
        let readabilityScore = Number(modelResponseJson.readabilityScore || 0);
        if (!readabilityScore || Number.isNaN(readabilityScore)) {
            readabilityScore = simpleReadabilityScore(output);
        }

        res.json({
            provider,
            output,
            variantA,
            variantB,
            variantC,
            readabilityScore
        });
    } catch (err) {
        console.error("Error in /api/humanize:", err);
        res.status(500).json({
            error: "Internal server error",
            details:
                process.env.NODE_ENV === "development" ? String(err.message || err) : undefined
        });
    }
});

app.listen(PORT, () => {
    console.log(`AI Humanizer backend running on http://localhost:${PORT}`);
});
