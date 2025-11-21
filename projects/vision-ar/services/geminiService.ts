import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

// Initialize Gemini Client
// Note: In a production environment, handle the case where API_KEY is missing more gracefully.
const ai = new GoogleGenAI({ apiKey: API_KEY });

export const analyzeImageFrame = async (
  base64Image: string,
  prompt: string = "What is in this image?",
  systemInstruction?: string
): Promise<string> => {
  try {
    // Strip metadata prefix if present (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const modelId = 'gemini-2.5-flash'; 
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        systemInstruction: systemInstruction || "You are an advanced AI Augmented Reality visual assistant. Analyze the visual input provided. Be concise, accurate, and helpful. Do not use markdown formatting for bold/italic heavily, keep it clean for an AR overlay.",
        temperature: 0.4,
        maxOutputTokens: 500,
      }
    });

    return response.text || "No analysis available.";
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return "Error analyzing visual data. Please try again.";
  }
};

export const chatWithContext = async (
  history: { role: string; parts: { text: string }[] }[],
  newMessage: string
): Promise<string> => {
  try {
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      history: history,
      config: {
          systemInstruction: "You are a helpful AR assistant. Keep responses brief enough to read on a mobile HUD."
      }
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "I'm having trouble connecting right now.";
  }
};
