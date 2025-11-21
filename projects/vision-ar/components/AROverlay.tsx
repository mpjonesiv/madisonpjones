import React, { useRef, useEffect } from 'react';
import { Message, ARMode } from '../types';
import { Scan, Aperture, Send, Mic, X, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import ReactMarkdown from 'react-markdown';

interface AROverlayProps {
  mode: ARMode;
  messages: Message[];
  onCapture: (prompt: string) => void;
  isProcessing: boolean;
  transcript: string;
  isListening: boolean;
  onToggleListening: () => void;
}

export const AROverlay: React.FC<AROverlayProps> = ({
  mode,
  messages,
  onCapture,
  isProcessing,
  transcript,
  isListening,
  onToggleListening
}) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onCapture(input);
    setInput('');
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10 overflow-hidden">
      {/* Header / Top HUD */}
      <div className="bg-gradient-to-b from-black/80 to-transparent p-4 pt-6 pointer-events-auto flex justify-between items-start">
        <div>
          <h1 className="text-cyan-400 font-mono text-xs tracking-[0.2em] uppercase mb-1">Gemini Vision AR</h1>
          <div className="flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
             <span className="text-white/70 text-xs font-mono">SYSTEM {isProcessing ? 'PROCESSING' : 'READY'}</span>
          </div>
        </div>
        <div className="flex gap-2">
           {/* Decorative HUD elements */}
           <div className="h-1 w-8 bg-cyan-500/30 rounded-full"></div>
           <div className="h-1 w-4 bg-cyan-500/30 rounded-full"></div>
        </div>
      </div>

      {/* Central Reticle (Only visible in IDLE or ANALYZING) */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-60">
        <div className="relative w-64 h-64 border border-cyan-500/30 rounded-lg">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>
            
            {isProcessing && (
                <div className="absolute inset-0 bg-cyan-500/10 animate-pulse rounded-lg"></div>
            )}
            
            {/* Crosshair */}
            <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-cyan-400/50 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>
      </div>

      {/* Chat / Result Area */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 pointer-events-auto mask-image-gradient-b pb-24">
        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/50 text-sm font-mono text-center mt-32">
                <Scan className="w-12 h-12 mb-4 opacity-50" />
                <p>Point at any object</p>
                <p>Tap specific buttons or ask questions</p>
            </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 backdrop-blur-md border ${
                msg.role === 'user'
                  ? 'bg-cyan-950/60 border-cyan-500/30 text-cyan-50'
                  : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-100'
              }`}
            >
              {msg.role === 'model' ? (
                  <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
              ) : (
                  <p className="text-sm">{msg.text}</p>
              )}
              <span className="text-[10px] opacity-40 mt-1 block font-mono text-right">
                 {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
        ))}
        {isProcessing && (
           <div className="flex justify-start">
               <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-700/50 rounded-2xl px-4 py-3">
                   <LoadingSpinner />
               </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Controls */}
      <div className="p-4 pb-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-auto">
        
        {/* Quick Actions */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
             {['Identify', 'Summarize text', 'Translate to English', 'Explain usage'].map((action) => (
                 <button 
                    key={action}
                    onClick={() => onCapture(action)}
                    disabled={isProcessing}
                    className="whitespace-nowrap bg-white/10 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 text-white text-xs px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm"
                 >
                    {action}
                 </button>
             ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening..." : "Ask about the view..."}
                className="w-full bg-white/10 border border-white/20 rounded-full px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 backdrop-blur-md transition-all"
            />
            {transcript && isListening && (
                <div className="absolute -top-8 left-0 right-0 text-center text-xs text-cyan-400 font-mono animate-pulse">
                    {transcript}
                </div>
            )}
          </div>
          
          <button
            type="button"
            onClick={onToggleListening}
            className={`p-3 rounded-full transition-colors backdrop-blur-md border ${isListening ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
          >
            {isListening ? <X className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            type="submit"
            disabled={!input.trim() && !isProcessing}
            className="p-3 rounded-full bg-cyan-500 text-black disabled:opacity-50 disabled:bg-gray-600 transition-transform active:scale-95 hover:bg-cyan-400"
          >
            {input.trim() ? <Send className="w-5 h-5" /> : <Aperture className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};
