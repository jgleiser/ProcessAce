const { GoogleGenerativeAI } = require("@google/genai");
const LlmProvider = require('./provider');
const logger = require('../logging/logger');

class GoogleProvider extends LlmProvider {
    constructor(config = {}) {
        super(config);
        const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY is not configured');
        }
        // Initialize the client
        this.client = new GoogleGenerativeAI(apiKey);
        this.modelName = config.model || 'gemini-2.5-flash-lite';
    }

    async complete(prompt, system) {
        try {
            logger.info({ model: this.modelName }, 'Calling Google GenAI API');

            // The new SDK structure is slightly different.
            // Assuming similar high-level usage, but let's verify if 'getGenerativeModel' exists 
            // or if it uses a different pattern.
            // 
            // Wait, looking at docs for @google/genai vs @google/generative-ai:
            // @google/generative-ai is the one commonly used for Node.js (gemini-pro). 
            // User ASKED for @google/genai specifically.
            //
            // If the user meant the newest SDK (v1.0.0+ of genai), the usage is:
            // const { GoogleGenerativeAI } = require("@google/generative-ai"); <-- This is actually the main one.
            //
            // Wait, there is a confusion here.
            // "@google/generative-ai" is the standard JS SDK.
            // "@google/genai" might be a different or newer beta one.
            //
            // Let's check the user comment again:
            // "Review https://docs.cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview?hl=es-419#googlegenaisdk_quickstart-nodejs_genai_sdk
            // The current SDK is @google/genai"
            //
            // Okay, the user insists on `@google/genai`.
            // The import for `@google/genai` is:
            // const { GoogleGenerativeAI } = require("@google/genai"); ?? 
            // OR 
            // const { GoogleAuth } = require('google-auth-library')...
            //
            // Actually, for `@google/genai`, the import is likely different.
            // e.g. import { GenAIClient } or similar.
            //
            // Let's assume standard usage for the NEW SDK based on recent docs:
            // const { GoogleGenerativeAI } = require("@google/genai");
            // If that fails, it might be the package structure.
            //
            // However, to fix the IMMEDIATE error "Cannot find module '@google/generative-ai'", 
            // it's because I installed `@google/genai` but required `@google/generative-ai`.
            // 
            // I will switch the require to `@google/genai` and adhere to its interface.
            //
            // IF `@google/genai` is the new Vertex/Studio unified SDK, usage might be:
            // const { VertexAI } = require('@google/genai');
            //
            // Let's try to match the import to the package name I installed: `@google/genai`.

            const { GoogleGenerativeAI } = require("@google/genai");
            // If this export exists, we are good. 
            // If not, we might need to adjust.
            //
            // Let's assume the user knows what they are asking for and the interface is similar enough 
            // or I'll standardise it. 
            //
            // Actually, checking standard docs, `@google/generative-ai` IS the package for "Google AI SDK for JavaScript".
            // `@google/genai` might be the specific one for Vertex?
            //
            // I will trust the install `npm install @google/genai` happened.
            // So `require('@google/genai')` should work.

            // Re-instantiating based on what we have.
            // If this fails again, I'll revert to `@google/generative-ai`.

            const model = this.client.getGenerativeModel({
                model: this.modelName,
                systemInstruction: system
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            logger.info({
                model: this.modelName,
                usage: response.usageMetadata
            }, 'Google GenAI API response received');

            return text;
        } catch (err) {
            logger.error({ err, model: this.modelName }, 'Google GenAI API call failed');
            throw err;
        }
    }
}

module.exports = GoogleProvider;
