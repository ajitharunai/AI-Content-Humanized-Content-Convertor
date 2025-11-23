const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Dummy init to get client
        // Actually the SDK doesn't have a direct listModels on the client instance in some versions, 
        // but usually it's on the class or we can try a simple generation to test a name.
        // Wait, the error message said: "Call ListModels to see the list of available models".
        // I will try to use the raw API or just test 'gemini-1.5-pro-002'.

        // Let's try to just run a generation with gemini-1.5-pro-002 to see if it works.
        console.log("Testing gemini-1.5-pro-002...");
        const model002 = genAI.getGenerativeModel({ model: "gemini-1.5-pro-002" });
        const result = await model002.generateContent("Hello");
        console.log("gemini-1.5-pro-002 is VALID. Response:", result.response.text());
    } catch (error) {
        console.error("gemini-1.5-pro-002 failed:", error.message);

        try {
            console.log("Testing gemini-1.5-pro...");
            const modelPro = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            const result = await modelPro.generateContent("Hello");
            console.log("gemini-1.5-pro is VALID. Response:", result.response.text());
        } catch (err) {
            console.error("gemini-1.5-pro failed:", err.message);
        }
    }
}

listModels();
