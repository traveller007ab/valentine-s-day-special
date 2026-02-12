
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CARDS_DATA } from './constants';
import FloatingHearts from './components/FloatingHearts';
import { Direction } from './types';

const App: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>(Direction.Next);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const navigateTo = useCallback((index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setDirection(index > currentIndex ? Direction.Next : Direction.Prev);
    setIsTransitioning(true);
    setTilt({ x: 0, y: 0 }); 
    
    setTimeout(() => {
      setCurrentIndex(index);
      setIsTransitioning(false);
    }, 700);
  }, [currentIndex, isTransitioning]);

  const goToNext = () => {
    if (currentIndex < CARDS_DATA.length - 1) {
      navigateTo(currentIndex + 1);
    } else {
      navigateTo(0);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      navigateTo(currentIndex - 1);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isTransitioning || !cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = ((clientX - rect.left) / rect.width) - 0.5;
    const y = ((clientY - rect.top) / rect.height) - 0.5;
    
    setTilt({ x: y * 12, y: -x * 12 });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0 });

  const createRipple = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    
    const id = Date.now();
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 800);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goToNext();
      if (e.key === 'ArrowLeft') goToPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isTransitioning]);

  const currentCard = CARDS_DATA[currentIndex];

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-6 overflow-hidden select-none bg-[#0a0f1d]">
      <FloatingHearts />

      {/* Main Artisan Card */}
      <div 
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={resetTilt}
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
          if (Math.abs(distance) > 50) {
            distance > 0 ? goToNext() : goToPrev();
          }
          touchStartX.current = null;
          touchEndX.current = null;
          resetTilt();
        }}
        onMouseDown={createRipple}
        className={`relative w-full max-w-[460px] h-[680px] velvet-card rounded-[2.5rem] z-10 p-8 md:p-12 flex flex-col transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
          ${isTransitioning ? (direction === Direction.Next ? 'translate-x-[-20%] translate-z-[-200px] rotate-y-25 opacity-0 scale-75' : 'translate-x-[20%] translate-z-[-200px] rotate-y-[-25%] opacity-0 scale-75') : 'translate-x-0 translate-z-0 opacity-100 scale-100'}
        `}
        style={{ 
          transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d'
        }}
      >
        {ripples.map(ripple => (
          <div 
            key={ripple.id} 
            className="ripple" 
            style={{ left: ripple.x - 50, top: ripple.y - 50, width: 100, height: 100 }}
          />
        ))}

        {/* Card Header */}
        <div className="text-center mb-6 flex-shrink-0 animate-entry" style={{ transform: 'translateZ(40px)' }}>
          <h1 className="text-4xl md:text-[2.6rem] font-serif-luxury text-white font-normal italic mb-3 tracking-tight">
            {currentCard.title}
          </h1>
          <div className="nav-line w-full mb-4 opacity-40" />
          <p className="text-[#e2b17a] uppercase tracking-[0.6em] text-[9px] font-bold">
            {currentCard.subtitle}
          </p>
        </div>

        {/* Card Body */}
        <div className="flex-grow flex flex-col items-center justify-center overflow-y-auto custom-scrollbar px-2" style={{ transform: 'translateZ(20px)' }}>
          {currentCard.emoji && (
            <div className={`text-6xl mb-8 opacity-90 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] ${currentIndex === 0 ? 'animate-bounce' : 'animate-pulse'}`}>
              {currentCard.emoji}
            </div>
          )}
          
          {currentCard.message && (
            <p className="text-white/90 text-center leading-[1.65] text-xl font-serif-luxury italic mb-8 animate-entry px-4">
              "{currentCard.message}"
            </p>
          )}

          <div className="w-full space-y-5">
            {currentCard.items && currentCard.items.map((item, idx) => (
              <div 
                key={`${currentIndex}-${idx}`}
                className={`flex flex-col items-center text-center opacity-0 animate-[fadeInSlide_1s_ease-out_forwards]`}
                style={{ animationDelay: `${idx * 0.12}s` }}
              >
                {currentIndex === CARDS_DATA.length - 1 ? (
                   <span className="text-white text-2xl font-serif-luxury px-6 py-8 relative leading-snug italic opacity-90 block">
                    <span className="absolute left-0 top-0 text-5xl text-[#e2b17a] opacity-30">“</span>
                    {item.replace(/“|”/g, '')}
                    <span className="absolute right-0 bottom-0 text-5xl text-[#e2b17a] opacity-30">”</span>
                   </span>
                ) : (
                  <div className="flex items-center space-x-3 py-1 group">
                    <span className="text-[#e2b17a] opacity-40 transition-opacity group-hover:opacity-100 font-serif-luxury">~</span>
                    <span className="text-white/85 text-[14.5px] font-light tracking-wide leading-relaxed">
                      {item}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {currentCard.prepTimes && (
            <div className="w-full space-y-12 mt-4 text-center">
              {currentCard.prepTimes.map((time, idx) => (
                <div 
                  key={idx}
                  className="opacity-0 animate-[fadeInSlide_1s_ease-out_forwards]"
                  style={{ animationDelay: `${idx * 0.2}s` }}
                >
                  <p className="text-[9px] uppercase tracking-[0.6em] text-[#e2b17a] font-bold mb-3 opacity-40">{time.label}</p>
                  <p className="text-white text-2xl font-serif-luxury italic leading-tight">{time.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footnote */}
        <div className="mt-auto pt-8 text-center text-[9px] uppercase tracking-[0.5em] text-white/10 font-medium" style={{ transform: 'translateZ(10px)' }}>
          Resonance — Humanness Edition
        </div>
      </div>

      {/* Modern Navigation */}
      <div className="fixed bottom-12 w-full max-w-[460px] flex items-center justify-between px-10 z-20">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0 || isTransitioning}
          className={`group flex items-center text-[11px] uppercase tracking-[0.4em] font-black transition-all duration-500
            ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'text-white/30 hover:text-[#e2b17a] hover:opacity-100'}
          `}
        >
          <span className="mr-3 transition-transform group-hover:-translate-x-2">←</span> Back
        </button>

        <div className="flex space-x-6 items-center">
          {CARDS_DATA.map((_, idx) => (
            <button
              key={idx}
              onClick={() => navigateTo(idx)}
              className={`w-[6px] h-[6px] rounded-full transition-all duration-700 ${
                idx === currentIndex ? 'bg-[#e2b17a] scale-[2.5] shadow-[0_0_20px_#e2b17a]' : 'bg-white/5 hover:bg-white/20'
              }`}
              aria-label={`View Part ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goToNext}
          disabled={isTransitioning}
          className="group flex items-center text-[11px] uppercase tracking-[0.4em] font-black text-white/30 hover:text-[#e2b17a] hover:opacity-100 transition-all duration-500"
        >
          {currentIndex === CARDS_DATA.length - 1 ? 'Again' : 'Next'} <span className="ml-3 transition-transform group-hover:translate-x-2">→</span>
        </button>
      </div>
    </div>
  );
};

export default App;
