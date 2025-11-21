import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AROverlay } from './components/AROverlay';
import { analyzeImageFrame, GeminiLiveSession } from './services/geminiService';
import { Message, ARMode } from './types';
import { CameraOff } from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const liveIntervalRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [mode, setMode] = useState<ARMode>(ARMode.IDLE);
  
  // Voice recognition state (Standard API)
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null); 

  // Initialize Camera with Fallback Strategy
  useEffect(() => {
    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false // We request audio separately for Live mode
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasPermission(true);
        }
      } catch (err) {
        console.warn("Preferred camera constraints failed:", err);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setHasPermission(true);
          }
        } catch (fallbackErr) {
          setHasPermission(false);
        }
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      // Cleanup Live Session if active
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
      }
      if (liveIntervalRef.current) {
        window.clearInterval(liveIntervalRef.current);
      }
    };
  }, []);

  // --- Standard Speech Recognition (Non-Live) ---
  useEffect(() => {
    if (('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) && mode !== ARMode.LIVE) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const finalTranscript = event.results[i][0].transcript;
                    setTranscript('');
                    setIsListening(false);
                    handleCapture(finalTranscript); 
                    recognitionRef.current.stop();
                } else {
                    interimTranscript += event.results[i][0].transcript;
                    setTranscript(interimTranscript);
                }
            }
        };

        recognitionRef.current.onerror = (event: any) => {
            setIsListening(false);
        };
    }
  }, [mode]);

  const toggleListening = () => {
    if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
    } else {
        recognitionRef.current?.start();
        setIsListening(true);
        setTranscript('');
    }
  };

  // --- Live Mode Logic ---
  const handleLiveTranscript = useCallback((text: string, isUser: boolean) => {
      // We can choose to show transcripts in the chat bubbling up
      // For now, we just show the latest transiently or append if completed
      if (isUser) {
          setTranscript(text); // Show as subtitle
      } else {
          // Optional: Append model response to chat history slowly?
          // For AR Live, we usually just listen. 
          // Let's just append completed turns to keep the history alive.
      }
  }, []);

  const toggleLiveMode = async () => {
      if (mode === ARMode.LIVE) {
          // Stop Live
          if (liveSessionRef.current) {
              liveSessionRef.current.disconnect();
              liveSessionRef.current = null;
          }
          if (liveIntervalRef.current) {
              window.clearInterval(liveIntervalRef.current);
              liveIntervalRef.current = null;
          }
          setMode(ARMode.IDLE);
          setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: 'system',
              text: "Live session ended.",
              timestamp: Date.now()
          }]);
      } else {
          // Start Live
          setMode(ARMode.LIVE);
          setMessages([]); // Clear screen for live view
          
          try {
              const session = new GeminiLiveSession(handleLiveTranscript);
              await session.connect();
              liveSessionRef.current = session;

              // Start Video Loop (2 FPS)
              liveIntervalRef.current = window.setInterval(() => {
                  if (videoRef.current && canvasRef.current && liveSessionRef.current) {
                      const video = videoRef.current;
                      const canvas = canvasRef.current;
                      canvas.width = video.videoWidth / 2; // Downscale for performance
                      canvas.height = video.videoHeight / 2;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                          const base64 = canvas.toDataURL('image/jpeg', 0.6);
                          liveSessionRef.current.sendVideoFrame(base64);
                      }
                  }
              }, 500);

          } catch (e) {
              console.error("Failed to start live session", e);
              setMode(ARMode.IDLE);
              alert("Could not connect to Gemini Live. Check console for details.");
          }
      }
  };


  // --- Snapshot Logic (Legacy) ---
  const handleCapture = useCallback(async (userPrompt: string) => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    const newUserMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        text: userPrompt,
        timestamp: Date.now()
    };
    setMessages(prev => [...prev, newUserMsg]);
    setIsProcessing(true);
    setMode(ARMode.ANALYZING);

    try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.7);

        const aiResponseText = await analyzeImageFrame(base64Image, userPrompt);

        const newAiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: aiResponseText,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, newAiMsg]);

    } catch (error) {
        console.error("Capture/Analysis failed", error);
        const errorMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'system',
            text: "Failed to analyze image.",
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsProcessing(false);
        setMode(ARMode.IDLE);
    }
  }, [isProcessing]);


  if (hasPermission === false) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white p-8 text-center">
        <div className="bg-red-500/20 p-6 rounded-full mb-6">
            <CameraOff className="w-12 h-12 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Camera Access Required</h2>
        <p className="text-zinc-400 max-w-xs mb-4">This AR experience needs access to your camera. Please enable permissions in your browser settings.</p>
        <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-cyan-500 text-black font-medium rounded-full hover:bg-cyan-400 transition-colors"
        >
            Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      <AROverlay 
        mode={mode}
        messages={messages}
        onCapture={handleCapture}
        isProcessing={isProcessing}
        transcript={transcript}
        isListening={isListening}
        onToggleListening={toggleListening}
        onToggleLive={toggleLiveMode}
      />
    </div>
  );
};

export default App;