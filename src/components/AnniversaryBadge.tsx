import React, { memo } from 'react';

interface AnniversaryBadgeProps {
  className?: string;
}

export const AnniversaryBadge: React.FC<AnniversaryBadgeProps> = memo(({ className = '' }) => {
  // 20 points around the gold star (40 alternating outer/inner vertices)
  // Perfectly round starburst seal with sharp triangle pointies sticking out like a gold star
  const N = 20;
  const W = 64;
  const H = 64;
  const cx = 32;
  const cy = 32;
  const rOut = 30.5;
  const rIn = 25.5;

  const points: string[] = [];
  for (let i = 0; i < N * 2; i++) {
    const angle = (i * Math.PI) / N - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const x = (cx + r * Math.cos(angle)).toFixed(1);
    const y = (cy + r * Math.sin(angle)).toFixed(1);
    points.push(`${x},${y}`);
  }

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      title="40th Anniversary (1986–2026)"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-11 h-11 sm:w-13 sm:h-13 drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)] transition-transform hover:scale-105"
        aria-label="40th Anniversary Gold Star Seal"
      >
        <defs>
          <linearGradient id="annivGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="15%" stopColor="#FDE68A" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <radialGradient id="annivInnerDisc" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="55%" stopColor="#FEF3C7" />
            <stop offset="85%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </radialGradient>
        </defs>

        {/* Outer Circular Starburst with Pointy Star Teeth */}
        <polygon
          points={points.join(' ')}
          fill="url(#annivGoldGrad)"
          stroke="#78350F"
          strokeWidth="0.85"
          strokeLinejoin="round"
        />

        {/* Smooth Inner Gold Circle Disc */}
        <circle
          cx={cx}
          cy={cy}
          r={23}
          fill="url(#annivInnerDisc)"
          stroke="#B45309"
          strokeWidth="0.8"
        />

        {/* Dotted Decorative Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={20.5}
          fill="none"
          stroke="#92400E"
          strokeWidth="0.6"
          strokeDasharray="2,1.6"
          opacity="0.8"
        />

        {/* 40th Anniversary Stamped Lettering */}
        <text
          x={cx}
          y={26.5}
          textAnchor="middle"
          fill="#451A03"
          fontSize="12.5"
          fontWeight="900"
          fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        >
          40th
        </text>

        <text
          x={cx}
          y={35}
          textAnchor="middle"
          fill="#78350F"
          fontSize="4.4"
          fontWeight="900"
          letterSpacing="0.08em"
          fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        >
          ANNIVERSARY
        </text>

        <text
          x={cx}
          y={41}
          textAnchor="middle"
          fill="#92400E"
          fontSize="3.6"
          fontWeight="800"
          letterSpacing="0.05em"
          fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        >
          1986–2026
        </text>
      </svg>
    </div>
  );
});
