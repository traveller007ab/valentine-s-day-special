
import React, { useMemo } from 'react';

interface FloatingHeartsProps {
  isSpecial?: boolean;
}

const FloatingHearts: React.FC<FloatingHeartsProps> = ({ isSpecial = false }) => {
  // Generate stable orb positions once to prevent jumping during transitions
  const orbConfig = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 80}%`,
      left: `${Math.random() * 80}%`,
      size: `${Math.random() * 250 + 200}px`,
      duration: `${Math.random() * 20 + 20}s`,
      delay: `${Math.random() * -10}s`,
    }));
  }, []);

  const defaultColors = ['#e2b17a', '#7e22ce', '#3b82f6', '#f43f5e', '#fbbf24'];
  const specialColors = ['#ff4d4d', '#ff8585', '#7a2222', '#e2b17a', '#ffb3b3'];
  const colors = isSpecial ? specialColors : defaultColors;

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {orbConfig.map((config, i) => (
        <div
          key={config.id}
          className="orb transition-all duration-[3000ms] ease-in-out"
          style={{
            top: config.top,
            left: config.left,
            width: config.size,
            height: config.size,
            backgroundColor: colors[i % colors.length],
            animationDuration: config.duration,
            animationDelay: config.delay,
            opacity: isSpecial ? 0.25 : 0.35,
            filter: `blur(120px) ${isSpecial ? 'brightness(1.4)' : ''}`,
          }}
        />
      ))}
    </div>
  );
};

export default FloatingHearts;
