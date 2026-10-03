import { useId } from 'react';
import './optical-field.css';

type OpticalFieldProps = {
  className?: string;
};

const spectrum = [
  { color: '#a193ff', y: 285 },
  { color: '#6f8cff', y: 385 },
  { color: '#4fc3e8', y: 485 },
  { color: '#e5ba7c', y: 585 },
  { color: '#db926f', y: 685 },
];

/** Decorative light field. Its only clock is the parent's --story-progress (0–1). */
export function OpticalField({ className = '' }: OpticalFieldProps) {
  const id = useId().replace(/:/g, '');
  const beamId = `${id}-beam`;
  const volumeId = `${id}-volume`;
  const routeId = `${id}-route`;

  return (
    <div className={`optical-field ${className}`} aria-hidden="true">
      <div className="optical-field__bloom" />
      <svg
        className="optical-field__scene"
        viewBox="0 0 1600 1000"
        fill="none"
        focusable="false"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient
            id={beamId}
            x1="0"
            y1="485"
            x2="1177"
            y2="485"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ddd8ff" stopOpacity="0" />
            <stop offset="0.56" stopColor="#f6f3ff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient
            id={volumeId}
            x1="250"
            y1="485"
            x2="1177"
            y2="485"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#7065b7" stopOpacity="0" />
            <stop offset="0.7" stopColor="#aba2e5" stopOpacity="0.012" />
            <stop offset="1" stopColor="#c2bdf5" stopOpacity="0.05" />
          </linearGradient>
          <path id={routeId} d="M-120 485H1058H1100L1135 422V534L1177 485" />
          {spectrum.map(({ color, y }, index) => (
            <linearGradient
              key={color}
              id={`${id}-spectrum-${index}`}
              x1="1177"
              y1="485"
              x2="1720"
              y2={y}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#ffffff" stopOpacity="0.56" />
              <stop offset="0.16" stopColor={color} stopOpacity="0.38" />
              <stop offset="0.68" stopColor={color} stopOpacity="0.12" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        <g className="optical-field__volume">
          <path d="M250 421L1058 479V491L250 549Z" fill={`url(#${volumeId})`} />
          {spectrum.map(({ color, y }, index) => (
            <path
              key={color}
              d={`M1177 483L1720 ${y - 17}V${y + 17}L1177 487Z`}
              fill={`url(#${id}-spectrum-${index})`}
              opacity="0.075"
            />
          ))}
        </g>

        <g className="optical-field__route">
          <use href={`#${routeId}`} stroke={`url(#${beamId})`} strokeWidth="12" opacity="0.04" />
          <use href={`#${routeId}`} stroke={`url(#${beamId})`} strokeWidth="4" opacity="0.13" />
          <use href={`#${routeId}`} stroke={`url(#${beamId})`} strokeWidth="0.8" />
          <use
            className="optical-field__signal"
            href={`#${routeId}`}
            stroke="#fbfaff"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>

        {/* Exact mark geometry from Logo in src/components.tsx, uniformly scaled. */}
        <g className="optical-field__mark" transform="translate(967 324) scale(7)">
          <path d="M16 6H6v10M28 6h10v10M6 28v10h10M38 28v10H28" />
          <path d="M13 23h6l5-9v16l6-7" />
        </g>

        <g className="optical-field__spectrum">
          {spectrum.map(({ color, y }, index) => (
            <path
              key={color}
              d={`M1177 485L1720 ${y}`}
              stroke={`url(#${id}-spectrum-${index})`}
              strokeWidth="0.85"
            />
          ))}
        </g>
      </svg>
      <div className="optical-field__shade" />
    </div>
  );
}
