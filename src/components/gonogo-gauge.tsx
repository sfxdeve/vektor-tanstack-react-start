import { verdictFromScore } from "@/lib/tender-scoring";

const VERDICT_META = {
  GO: { color: "#16A34A", subtitle: "Recommended to bid" },
  CAUTION: { color: "#D97706", subtitle: "Address risks first" },
  "NO-GO": { color: "#DC2626", subtitle: "High disqualification risk" },
  UNKNOWN: { color: "#71717A", subtitle: "Score unavailable" },
} as const;

export function GoNoGoGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const label = verdictFromScore(clamped);
  const { color, subtitle } =
    VERDICT_META[label as keyof typeof VERDICT_META] ?? VERDICT_META["NO-GO"];
  const size = 180;
  const radius = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const startAngle = Math.PI;
  const endAngle = Math.PI + (clamped / 100) * Math.PI;
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const bgEndX = cx + radius * Math.cos(Math.PI * 2);
  const bgEndY = cy + radius * Math.sin(Math.PI * 2);
  const largeArc = clamped > 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center" data-testid="gonogo-gauge">
      <svg width={size} height={size / 1.5 + 12} viewBox={`0 0 ${size} ${size / 1.5 + 15}`}>
        <path
          d={`M ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${bgEndX} ${bgEndY}`}
          fill="none"
          stroke="#E4E4E7"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {clamped > 0 && (
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
        )}
        {[50, 75].map((tick) => {
          const angle = Math.PI + (tick / 100) * Math.PI;
          const inner = radius - 10;
          const outer = radius + 10;
          return (
            <line
              key={tick}
              x1={cx + inner * Math.cos(angle)}
              y1={cy + inner * Math.sin(angle)}
              x2={cx + outer * Math.cos(angle)}
              y2={cy + outer * Math.sin(angle)}
              stroke="#71717A"
              strokeWidth="1.5"
            />
          );
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={size / 5}
          fontWeight={700}
          fontFamily="Cabinet Grotesk, sans-serif"
          fill="#09090B"
        >
          {clamped}%
        </text>
      </svg>
      <div className="text-center mt-1" style={{ color }} data-testid="gonogo-label-wrapper">
        <div className="text-xl font-bold tracking-tight" data-testid="verdict-label">
          {label}
        </div>
        <div className="text-xs text-zinc-500">{subtitle}</div>
      </div>
    </div>
  );
}
