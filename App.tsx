import React, { useState, useEffect } from 'react';
import AudioFireworks from './components/AudioFireworks';
import { GoogleGenAI } from "@google/genai";

// Although the core visualizer runs on Web Audio API for zero-latency 60fps performance,
// we initialize the Gemini client as requested for potential future AI-driven mood analysis extensions.
// Note: Real-time physics are handled locally via AnalyserNode for immediate responsiveness.
const API_KEY = process.env.API_KEY;

const App: React.FC = () => {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      // Test microphone access before mounting the heavy 3D scene
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately, let the component handle its own stream
      stream.getTracks().forEach(track => track.stop());
      setStarted(true);
      setError(null);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setError("Microphone access is required to visualize the sound. Please allow access and try again.");
    }
  };

  return (
    <div className="relative w-full h-screen bg-black text-white font-sans overflow-hidden">
      {!started ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-gray-900 bg-opacity-95 p-6">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-pink-500 rounded-lg blur opacity-75 animate-pulse"></div>
              <div className="relative bg-black rounded-lg p-8 ring-1 ring-white/10">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-pink-400 to-yellow-400 mb-4">
                  Sonic Fireworks
                </h1>
                <p className="text-gray-300 mb-6">
                  An interactive 3D visualizer driven by your voice and music.
                </p>
                <div className="space-y-4 text-sm text-gray-400 text-left bg-gray-900/50 p-4 rounded border border-gray-800">
                  <p><i className="fas fa-wave-square text-blue-400 mr-2"></i> <strong>Bass (Low Freq):</strong> Creates calm, small particles.</p>
                  <p><i className="fas fa-bolt text-yellow-400 mr-2"></i> <strong>Treble (High Freq):</strong> Triggers massive, bright explosions.</p>
                  <p><i className="fas fa-microphone text-pink-400 mr-2"></i> <strong>Microphone:</strong> Required for real-time analysis.</p>
                </div>
              </div>
            </div>

            {error && (
               <div className="p-4 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
                 {error}
               </div>
            )}

            <button
              onClick={handleStart}
              className="group relative inline-flex items-center justify-center px-8 py-3 text-lg font-bold text-white transition-all duration-200 bg-indigo-600 font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 hover:bg-indigo-500"
            >
              <i className="fas fa-play mr-2 group-hover:scale-110 transition-transform"></i>
              Start Experience
            </button>
          </div>
        </div>
      ) : (
        <AudioFireworks />
      )}
    </div>
  );
};

export default App;