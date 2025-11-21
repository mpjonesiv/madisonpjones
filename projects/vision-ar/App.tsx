import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AROverlay } from './components/AROverlay';
import { analyzeImageFrame } from './services/geminiService';
import { Message, ARMode } from './types';
import { CameraOff } from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [mode, setMode] = useState<ARMode>(ARMode.IDLE);
  
  // Voice recognition state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null); // Type as any for simplicity with Web Speech API

  // Initialize Camera with Fallback Strategy
  useEffect(() => {
    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("navigator.mediaDevices.getUserMedia is not supported in this browser.");
        setHasPermission(false);
        return;
      }

      try {
        // Attempt 1: Preferred settings (High Res, Back Camera)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasPermission(true);
        }
      } catch (err) {
        console.warn("Preferred camera constraints failed:", err);
        
        try {
          // Attempt 2: Relaxed settings (Any Camera, Default Res)
          console.log("Attempting fallback camera access...");
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setHasPermission(true);
          }
        } catch (fallbackErr) {
          console.error("Camera access completely denied:", fallbackErr);
          setHasPermission(false);
        }
      }
    };

    startCamera();

    return () => {
      // Cleanup streams on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
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
                    handleCapture(finalTranscript); // Auto-submit on final voice command
                    recognitionRef.current.stop();
                } else {
                    interimTranscript += event.results[i][0].transcript;
                    setTranscript(interimTranscript);
                }
            }
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };
    }
  }, []);

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

  // Core Logic: Capture Frame & Send to Gemini
  const handleCapture = useCallback(async (userPrompt: string) => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // 1. Optimistic UI update
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
        // 2. Capture Frame
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 3. Convert to Base64
        // Lower quality (0.7) for faster transmission
        const base64Image = canvas.toDataURL('image/jpeg', 0.7);

        // 4. Send to Gemini Service
        const aiResponseText = await analyzeImageFrame(base64Image, userPrompt);

        // 5. Update UI with AI Response
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
            text: "Failed to analyze image. Please ensure the camera is active and try again.",
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
      {/* Hidden Canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video Feed Layer */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* AR HUD Layer */}
      <AROverlay 
        mode={mode}
        messages={messages}
        onCapture={handleCapture}
        isProcessing={isProcessing}
        transcript={transcript}
        isListening={isListening}
        onToggleListening={toggleListening}
      />
    </div>
  );
};

export default App;