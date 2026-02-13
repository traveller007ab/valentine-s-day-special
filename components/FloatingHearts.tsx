
import React, { useEffect, useState } from 'react';

interface FloatingHeartsProps {
  isSpecial?: boolean;
}

const FloatingHearts: React.FC<FloatingHeartsProps> = ({ isSpecial = false }) => {
  const [orbs, setOrbs] = useState<{ id: number; top: string; left: string; size: string; duration: string; color: string; delay: string }[]>([]);

  useEffect(() => {
    const defaultColors = ['#e2b17a', '#7e22ce', '#3b82f6', '#f43f5e', '#fbbf24'];
    const specialColors = ['#ff4d4d', '#ff8585', '#7a2222', '#e2b17a', '#ffb3b3'];
    
    const colors = isSpecial ? specialColors : defaultColors;

    const newOrbs = Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 80}%`,
      left: `${Math.random() * 80}%`,
      size: `${Math.random() * 200 + 150}px`,
      duration: `${Math.random() * 20 + 20}s`,
      delay: `${Math.random() * -10}s`,
      color: colors[i % colors.length]
    }));
    setOrbs(newOrbs);
  }, [isSpecial]);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {orbs.map(orb => (
        <div
          key={orb.id}
          className="orb transition-colors duration-[3000ms]"
          style={{
            top: orb.top,
            left: orb.left,
            width: orb.size,
            height: orb.size,
            backgroundColor: orb.color,
            animationDuration: orb.duration,
            animationDelay: orb.delay,
            opacity: isSpecial ? 0.2 : 0.3
          }}
        />
      ))}
    </div>
  );
};

export default FloatingHearts;
