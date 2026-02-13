import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CARDS_DATA } from './constants.ts';
import FloatingHearts from './components/FloatingHearts.tsx';
import { Direction } from './types.ts';
import { GoogleGenAI, Modality } from "@google/genai";

/** 
 * CUSTOMIZATION: 
 * Paste a link to your favorite MP3/WAV here to replace the procedural synth pad.
 */
const CUSTOM_AUDIO_URL: string = ""; 

// Audio Utility Functions
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>(Direction.Next);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [activeDef, setActiveDef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const ambientGainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);

  const initAudio = useCallback(async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return;
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    audioContextRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0; 
    masterGain.connect(ctx.destination);
    ambientGainRef.current = masterGain;

    if (CUSTOM_AUDIO_URL && CUSTOM_AUDIO_URL.trim() !== "") {
      const audio = new Audio(CUSTOM_AUDIO_URL);
      audio.crossOrigin = "anonymous";
      audio.loop = true;
      customAudioRef.current = audio;
      const source = ctx.createMediaElementSource(audio);
      source.connect(masterGain);
      audio.play().catch(() => console.warn("Auto-play blocked until user interaction."));
    } 
    else {
      // PROCEDURAL WARM PAD - DEEPER & DARKER
      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.value = 220; // Deep warmth
      lpFilter.Q.value = 2.0; // Resonant but filtered
      lpFilter.connect(masterGain);
      filterRef.current = lpFilter;

      // Lower Register Chord (Sub-bass and Low Mids)
      const freqs = [55.00, 82.41, 103.83, 110.00, 164.81]; 
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f + (Math.random() * 0.5 - 0.25);
        oscGain.gain.value = 0.08;
        osc.connect(oscGain);
        oscGain.connect(lpFilter);
        osc.start();
        oscillatorsRef.current.push(osc);
      });

      // Ultra-Slow Breathing LFO
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.05; // 20 second breath cycle
      lfoGain.gain.value = 100; 
      lfo.connect(lfoGain);
      lfoGain.connect(lpFilter.frequency);
      lfo.start();
    }

    if (!isMuted) {
      masterGain.gain.setTargetAtTime(0.08, ctx.currentTime, 4); 
    }
  }, [isMuted]);

  const playChime = (freq = 440) => {
    if (isMuted || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, ctx.currentTime + 2.5);
    
    // Softer felt-mallet envelope
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.3); // Slow attack
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 2.5);
  };

  const toggleMute = () => {
    initAudio();
    const newMute = !isMuted;
    setIsMuted(newMute);
    if (ambientGainRef.current && audioContextRef.current) {
      ambientGainRef.current.gain.setTargetAtTime(newMute ? 0 : 0.08, audioContextRef.current.currentTime, 2.5);
    }
  };

  const navigateTo = useCallback((index: number) => {
    if (isTransitioning || index === currentIndex) return;
    
    initAudio();
    playChime(index > currentIndex ? 330 : 220); // Much lower pitched navigation

    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch(e) {}
      activeSourceRef.current = null;
    }

    setDirection(index > currentIndex ? Direction.Next : Direction.Prev);
    setIsTransitioning(true);
    setTilt({ x: 0, y: 0 }); 
    setIsReading(false);
    setIsLoadingVoice(false);
    setActiveDef(null);
    setError(null);
    
    setTimeout(() => {
      setCurrentIndex(index);
      setIsTransitioning(false);
    }, 700);
  }, [currentIndex, isTransitioning, initAudio]);

  const goToNext = () => {
    if (currentIndex < CARDS_DATA.length - 1) navigateTo(currentIndex + 1);
    else navigateTo(0);
  };

  const goToPrev = () => {
    if (currentIndex > 0) navigateTo(currentIndex - 1);
  };

  const speakCard = async () => {
    if (isReading || isLoadingVoice) return;
    
    await initAudio();
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      setError("AI voice configuration is pending.");
      return;
    }

    setIsLoadingVoice(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      const card = CARDS_DATA[currentIndex];
      const textToSpeak = `${card.title}. ${card.subtitle}. ${card.message || ''} ${card.items?.join('. ') || ''}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Speak this in a warm, low, soothing, intimate whisper, very slowly: ${textToSpeak}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio && audioContextRef.current) {
        const ctx = audioContextRef.current;
        const uint8Audio = decodeBase64(base64Audio);
        const audioBuffer = await decodeAudioData(uint8Audio, ctx, 24000, 1);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0.9;
        source.connect(voiceGain);
        voiceGain.connect(ctx.destination);
        
        if (ambientGainRef.current) {
          ambientGainRef.current.gain.setTargetAtTime(0.01, ctx.currentTime, 1.5);
        }

        activeSourceRef.current = source;
        source.onended = () => {
          setIsReading(false);
          activeSourceRef.current = null;
          if (ambientGainRef.current && !isMuted) {
            ambientGainRef.current.gain.setTargetAtTime(0.08, ctx.currentTime, 3);
          }
        };
        
        setIsLoadingVoice(false);
        setIsReading(true);
        source.start();
      }
    } catch (err) {
      console.error("TTS Error:", err);
      setError("The voice is resting.");
      setIsLoadingVoice(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isTransitioning || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = ((clientX - rect.left) / rect.width) - 0.5;
    const y = ((clientY - rect.top) / rect.height) - 0.5;
    setTilt({ x: y * 4, y: -x * 4 });
  };

  const createRipple = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
    const id = Date.now();
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 1000);
    playChime(550); 
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goToNext();
      if (e.key === 'ArrowLeft') goToPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isTransitioning]);

  const renderInteractiveText = (text: string) => {
    const parts = text.split(/\{(.*?)\}/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return (
          <span 
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setActiveDef(currentCard.definitions?.[part] || null);
              playChime(660);
            }}
            className="cursor-help text-[#e2b17a] font-serif-luxury italic border-b border-[#e2b17a]/20 hover:border-[#e2b17a]/60 transition-all duration-700 relative group inline-block mx-0.5"
          >
            {part}
            <span className="absolute -inset-1 bg-[#e2b17a]/5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity blur-[8px]" />
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const currentCard = CARDS_DATA[currentIndex];

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden select-none bg-[#03050a]">
      <FloatingHearts />

      {/* Header Overlay Toggle */}
      <button 
        onClick={toggleMute}
        className="fixed top-6 left-6 z-40 flex items-center space-x-3 group bg-black/40 backdrop-blur-3xl px-6 py-3 rounded-full border border-white/5 hover:border-white/10 transition-all shadow-2xl"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-1000 ${isMuted ? 'text-white/5' : 'text-[#e2b17a]/60 drop-shadow-[0_0_12px_rgba(226,177,122,0.3)]'}`}>
          {isMuted ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
          ) : (
            <div className="flex items-center space-x-1">
              {[1, 2, 3].map(i => (
                <div key={i} className={`w-0.5 bg-current rounded-full animate-[soundWave_2.5s_ease-in-out_infinite]`} style={{ height: `${i*3}px`, animationDelay: `${i*0.4}s` }} />
              ))}
            </div>
          )}
        </div>
        <span className={`text-[9px] uppercase tracking-[0.6em] transition-opacity duration-1000 font-light ${isMuted ? 'opacity-10' : 'opacity-40 text-[#e2b17a]'}`}>
          {isMuted ? 'Silent' : 'Resonating'}
        </span>
      </button>

      {/* Main Artisan Card Container */}
      <div 
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        onTouchMove={(e) => {
          handleMouseMove(e);
          touchEndX.current = e.targetTouches[0].clientX;
        } }
        onTouchStart={(e) => {
          touchStartX.current = e.targetTouches[0].clientX;
          createRipple(e);
        }}
        onTouchEnd={() => {
          if (!touchStartX.current || !touchEndX.current) return;
          const distance = touchStartX.current - touchEndX.current;
          if (Math.abs(distance) > 60) {
            distance > 0 ? goToNext() : goToPrev();
          }
          touchStartX.current = null;
          touchEndX.current = null;
          setTilt({ x: 0, y: 0 });
        }}
        onMouseDown={createRipple}
        className={`relative w-full max-w-[460px] h-[85vh] max-h-[700px] velvet-card rounded-[3rem] z-20 p-10 md:p-14 flex flex-col transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]
          ${isTransitioning ? (direction === Direction.Next ? 'translate-x-[-10%] opacity-0 scale-95 blur-2xl' : 'translate-x-[10%] opacity-0 scale-95 blur-2xl') : 'translate-x-0 opacity-100 scale-100 blur-0'}
          ${!isTransitioning ? 'animate-[pulse_20s_ease-in-out_infinite]' : ''}
        `}
        style={{ 
          transform: `perspective(1500px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d'
        }}
      >
        {ripples.map(ripple => (
          <div key={ripple.id} className="ripple" style={{ left: ripple.x - 50, top: ripple.y - 50, width: 100, height: 100 }} />
        ))}

        <div className="absolute top-10 right-10 z-30 flex flex-col space-y-4 items-center">
          <button 
            onClick={(e) => { e.stopPropagation(); speakCard(); }}
            className={`p-4 rounded-full transition-all duration-1000 bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.05] ${isLoadingVoice ? 'text-[#e2b17a] animate-spin' : isReading ? 'text-[#e2b17a] scale-110 shadow-[0_0_30px_rgba(226,177,122,0.2)]' : 'text-white/10'}`}
          >
            {isLoadingVoice ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            ) : isReading ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v10h-2z"/></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
            )}
          </button>
        </div>

        <div className="text-center mb-10 flex-shrink-0 animate-entry">
          <h1 className="text-4xl md:text-[3rem] font-serif-luxury text-white/90 font-normal italic mb-3 tracking-tighter">
            {currentCard.title}
          </h1>
          <div className="nav-line w-full mb-4 opacity-10" />
          <p className="text-[#e2b17a]/60 uppercase tracking-[0.8em] text-[8px] font-black">
            {currentCard.subtitle}
          </p>
        </div>

        <div className="flex-grow flex flex-col items-center justify-center overflow-y-auto custom-scrollbar px-2 py-6">
          {currentCard.emoji && (
            <div className={`text-6xl md:text-7xl mb-12 opacity-40 drop-shadow-[0_0_50px_rgba(226,177,122,0.15)] ${currentIndex === 0 ? 'animate-bounce' : 'animate-pulse'}`}>
              {currentCard.emoji}
            </div>
          )}
          
          {currentCard.message && (
            <div className="text-white/80 text-center leading-[2] text-xl md:text-2xl font-serif-luxury italic mb-10 animate-entry px-4">
              "{renderInteractiveText(currentCard.message)}"
            </div>
          )}

          <div className="w-full space-y-6">
            {currentCard.items && currentCard.items.map((item, idx) => (
              <div 
                key={`${currentIndex}-${idx}`}
                className="flex flex-col items-center text-center opacity-0 animate-[fadeInSlide_1.5s_ease-out_forwards]"
                style={{ animationDelay: `${idx * 0.2}s` }}
              >
                {currentIndex === CARDS_DATA.length - 1 ? (
                   <span className="text-white/90 text-2xl md:text-3xl font-serif-luxury px-8 py-10 relative leading-snug italic opacity-80 block">
                    <span className="absolute left-[-20px] top-0 text-6xl text-[#e2b17a] opacity-10">“</span>
                    {item.replace(/“|”/g, '')}
                    <span className="absolute right-[-20px] bottom-0 text-6xl text-[#e2b17a] opacity-10">”</span>
                   </span>
                ) : (
                  <div className="flex items-center space-x-5 py-2 group">
                    <span className="text-[#e2b17a] opacity-20 font-serif-luxury text-[10px]">◆</span>
                    <span className="text-white/70 text-[15px] font-light tracking-widest leading-relaxed">
                      {renderInteractiveText(item)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {currentCard.prepTimes && (
            <div className="w-full space-y-12 mt-8 text-center">
              {currentCard.prepTimes.map((time, idx) => (
                <div key={idx} className="opacity-0 animate-[fadeInSlide_1.5s_ease-out_forwards]" style={{ animationDelay: `${idx * 0.3}s` }}>
                  <p className="text-[9px] uppercase tracking-[0.6em] text-[#e2b17a]/40 font-black mb-3">{time.label}</p>
                  <p className="text-white/80 text-2xl md:text-3xl font-serif-luxury italic leading-tight">{time.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {(activeDef || error) && (
          <div className="absolute inset-x-8 bottom-28 p-8 bg-black/60 backdrop-blur-[60px] border border-white/5 rounded-[2.5rem] animate-entry text-center z-50 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)]">
             <p className={`text-[10px] uppercase tracking-[0.5em] mb-3 font-black ${error ? 'text-rose-400' : 'text-[#e2b17a]/60'}`}>
               {error ? 'Attention' : 'Deeper Echo'}
             </p>
             <p className="text-white/90 text-[16px] font-serif-luxury italic leading-relaxed">
               {error || activeDef}
             </p>
             <button 
              onClick={() => { setActiveDef(null); setError(null); }} 
              className="mt-6 text-[9px] uppercase tracking-[0.7em] text-white/20 hover:text-white/60 transition-all py-3 px-8 border border-white/5 hover:border-white/10 rounded-full"
             >
               Dismiss
             </button>
          </div>
        )}

        <div className="mt-auto pt-10 text-center text-[9px] uppercase tracking-[0.8em] text-white/5 font-black">
          Infinite Softness
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="fixed bottom-12 w-full max-w-[460px] flex items-center justify-between px-12 z-30">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0 || isTransitioning}
          className={`group flex items-center text-[11px] uppercase tracking-[0.5em] font-light transition-all duration-1000
            ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'text-white/10 hover:text-[#e2b17a] hover:opacity-100'}
          `}
        >
          <span className="mr-4 transition-transform group-hover:-translate-x-3 text-lg opacity-40">←</span> 
          <span className="hidden md:inline">Back</span>
        </button>

        <div className="flex space-x-8 items-center">
          {CARDS_DATA.map((_, idx) => (
            <button
              key={idx}
              onClick={() => navigateTo(idx)}
              className={`w-[4px] h-[4px] rounded-full transition-all duration-1000 ${
                idx === currentIndex ? 'bg-[#e2b17a] scale-[3.5] shadow-[0_0_25px_rgba(226,177,122,0.6)]' : 'bg-white/5 hover:bg-white/20'
              }`}
              aria-label={`Phase ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goToNext}
          disabled={isTransitioning}
          className="group flex items-center text-[11px] uppercase tracking-[0.5em] font-light text-white/10 hover:text-[#e2b17a] hover:opacity-100 transition-all duration-1000"
        >
          <span className="hidden md:inline">{currentIndex === CARDS_DATA.length - 1 ? 'Replay' : 'Phase'}</span>
          <span className="ml-4 transition-transform group-hover:translate-x-3 text-lg opacity-40">→</span>
        </button>
      </div>

      <div className="fixed bottom-6 text-center w-full opacity-5 pointer-events-none z-0">
        <p className="text-[8px] uppercase tracking-[1.5em] text-white/80 font-extralight">Resonance — Crafted with Presence</p>
      </div>
    </div>
  );
};

export default App;