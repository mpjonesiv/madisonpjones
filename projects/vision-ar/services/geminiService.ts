import { GoogleGenAI, GenerateContentResponse, LiveServerMessage, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY as string;

const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- Existing Static Analysis ---

export const analyzeImageFrame = async (
  base64Image: string,
  prompt: string = "What is in this image?",
  systemInstruction?: string
): Promise<string> => {
  try {
    const cleanBase64 = base64Image.split(',')[1] || base64Image;
    const modelId = 'gemini-2.5-flash'; 
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
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

// --- Live API Implementation ---

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Audio context for playing back model response
let audioContext: AudioContext | null = null;

export class GeminiLiveSession {
  private session: any = null;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(private onTranscript: (text: string, isUser: boolean) => void) {}

  async connect() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: "You are an intelligent AR assistant provided with a video stream. You answer questions about what you see concisely.",
        inputAudioTranscription: {}, 
        outputAudioTranscription: {} 
      },
      callbacks: {
        onopen: () => {
          console.log("Live session connected");
          this.startAudioInput();
        },
        onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message);
        },
        onclose: () => console.log("Live session closed"),
        onerror: (err) => console.error("Live session error", err),
      }
    });

    this.session = await this.sessionPromise;
  }

  private async startAudioInput() {
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);
        
        if (this.sessionPromise) {
            this.sessionPromise.then(session => {
                session.sendRealtimeInput({
                    media: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: pcmData
                    }
                });
            });
        }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  sendVideoFrame(base64Image: string) {
    if (!this.sessionPromise) return;
    
    const cleanBase64 = base64Image.split(',')[1] || base64Image;
    this.sessionPromise.then(session => {
        session.sendRealtimeInput({
            media: {
                mimeType: 'image/jpeg',
                data: cleanBase64
            }
        });
    });
  }

  private floatTo16BitPCM(float32Array: Float32Array): string {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return arrayBufferToBase64(new Uint8Array(int16Array.buffer));
  }

  private async handleMessage(message: LiveServerMessage) {
    // Handle Transcriptions
    if (message.serverContent?.inputTranscription?.text) {
        this.onTranscript(message.serverContent.inputTranscription.text, true);
    }
    if (message.serverContent?.outputTranscription?.text) {
        this.onTranscript(message.serverContent.outputTranscription.text, false);
    }

    // Handle Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && audioContext) {
        const bytes = base64ToUint8Array(audioData);
        const audioBuffer = await this.pcmToAudioBuffer(bytes, audioContext);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        // Basic scheduling to prevent overlap
        const currentTime = audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }
        
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        
        this.sources.add(source);
        source.onended = () => this.sources.delete(source);
    }

    // Handle Interruptions
    if (message.serverContent?.interrupted) {
        this.sources.forEach(s => s.stop());
        this.sources.clear();
        this.nextStartTime = 0;
    }
  }

  private async pcmToAudioBuffer(bytes: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const int16 = new Int16Array(bytes.buffer);
    const floats = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        floats[i] = int16[i] / 32768.0;
    }
    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);
    return buffer;
  }

  disconnect() {
    if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
    }
    if (this.source) {
        this.source.disconnect();
        this.source = null;
    }
    if (this.inputAudioContext) {
        this.inputAudioContext.close();
        this.inputAudioContext = null;
    }
    if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
    }
    // Note: We do not close the global audioContext for output as it can be reused
    
    // Usually there isn't a direct 'disconnect' on the session object in the client 
    // but we can stop sending data.
    this.session = null;
    this.sessionPromise = null;
  }
}