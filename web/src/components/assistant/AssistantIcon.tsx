import { useId } from 'react';

// The assistant's mark: a friendly bot head (visor, two eyes, ears) with a
// crescent and star on its antenna, in KMCC's navy. `bare`: no navy disc
// behind it (the launcher button has its own background).
export default function AssistantIcon({ size = 32, bare = false }: { size?: number; bare?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false" className="assistant-icon">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6aa3" />
          <stop offset="0.55" stopColor="#0f3460" />
          <stop offset="1" stopColor="#0a2240" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {!bare && <circle cx="32" cy="32" r="32" fill={`url(#${id}-bg)`} />}
      {/* crescent and star on the antenna */}
      <path d="M30.6 9.2a4.4 4.4 0 1 0 0 7.6a3.6 3.6 0 1 1 0-7.6z" fill={`url(#${id}-gold)`} />
      <path d="M34.6 11.2l.7 1.5l1.6.2l-1.2 1.1l.3 1.6l-1.4-.8l-1.4.8l.3-1.6l-1.2-1.1l1.6-.2z" fill={`url(#${id}-gold)`} />
      <rect x="31.2" y="17.5" width="1.6" height="6" rx="0.8" fill="#ffffff" fillOpacity="0.9" />
      <circle cx="32" cy="24.5" r="2.4" fill="#ffffff" fillOpacity="0.96" />
      {/* ears */}
      <rect x="13" y="34" width="4" height="10" rx="2" fill="#ffffff" fillOpacity="0.9" />
      <rect x="47" y="34" width="4" height="10" rx="2" fill="#ffffff" fillOpacity="0.9" />
      {/* face, visor, eyes */}
      <rect x="16.5" y="26.5" width="31" height="24" rx="8" fill="#ffffff" />
      <rect x="20.5" y="32" width="23" height="12" rx="6" fill="#0a2240" />
      <circle cx="27" cy="38" r="2.5" fill="#8cc4f5" />
      <circle cx="37" cy="38" r="2.5" fill="#8cc4f5" />
      {/* a spark: it thinks */}
      <path d="M51 12.5l1.1 2.6l2.6 1.1l-2.6 1.1L51 19.9l-1.1-2.6l-2.6-1.1l2.6-1.1z" fill={`url(#${id}-gold)`} />
    </svg>
  );
}
