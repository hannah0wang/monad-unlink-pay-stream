export default function NinjaLogo({ size = 24, color = '#836EF9' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shuriken — two overlapping blades rotated 45° */}
      <g transform="rotate(0 12 12)">
        <path
          d="M12 2 L14.8 9.2 L22 12 L14.8 14.8 L12 22 L9.2 14.8 L2 12 L9.2 9.2 Z"
          fill={color}
          fillOpacity="0.15"
        />
        <path
          d="M12 4.5 L13.8 10.2 L19.5 12 L13.8 13.8 L12 19.5 L10.2 13.8 L4.5 12 L10.2 10.2 Z"
          fill={color}
        />
      </g>
      {/* Center hole */}
      <circle cx="12" cy="12" r="2.2" fill="transparent" stroke={color} strokeWidth="1.2" />
      {/* Inner dot */}
      <circle cx="12" cy="12" r="0.8" fill={color} />
    </svg>
  )
}
