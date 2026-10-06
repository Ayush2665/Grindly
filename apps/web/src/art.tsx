// FRONTEND: the shoe and dumbbell drawings (inline SVG, no image files).
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="gOr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa35c" /><stop offset=".55" stopColor="#ff6a1f" /><stop offset="1" stopColor="#c9380d" /></linearGradient>
        <linearGradient id="gSil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6ece5" /><stop offset=".5" stopColor="#b9a89d" /><stop offset="1" stopColor="#6e5f56" /></linearGradient>
        <linearGradient id="gShoe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a2820" /><stop offset="1" stopColor="#1b1210" /></linearGradient>
      </defs>
    </svg>
  );
}

export function Shoe() {
  return (
    <svg viewBox="0 0 270 130" className="art" role="img" aria-label="Running shoe">
      <g stroke="url(#gOr)" strokeWidth="3.5" strokeLinecap="round" opacity=".55"><path d="M4 44h44M0 62h54M10 80h38" /></g>
      <path d="M56 100c0-8 8-10 18-10h168c16 0 22 8 20 16-1 6-6 8-12 8H70c-8 0-14-4-14-14Z" fill="#f4e8e0" />
      <path d="M56 105h206" stroke="#d3c0b3" strokeWidth="2" />
      <rect x="150" y="96" width="62" height="8" rx="4" fill="url(#gOr)" />
      <path d="M58 92l2-34c0-8 6-12 14-12h18c6 0 10-4 14-10 4-6 12-8 20-5l8 4c8 11 20 21 40 27 28 8 66 10 82 28Z" fill="url(#gShoe)" stroke="#ff7a2f" strokeOpacity=".35" />
      <path d="M60 58c0-8 6-12 14-12h18" fill="none" stroke="#ff7a2f" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M92 86c34 2 80-4 122-16" fill="none" stroke="url(#gOr)" strokeWidth="7" strokeLinecap="round" />
      <g stroke="#f4e8e0" strokeWidth="3.2" strokeLinecap="round"><path d="M112 42l12 10" /><path d="M125 48l12 10" /><path d="M138 54l12 9" /><path d="M152 60l12 8" /></g>
    </svg>
  );
}

export function Dumbbell() {
  return (
    <svg viewBox="0 0 260 130" className="art" role="img" aria-label="Dumbbell">
      <rect x="44" y="52" width="172" height="26" rx="8" fill="#2b1d17" />
      <rect x="62" y="58" width="136" height="14" rx="7" fill="url(#gSil)" />
      <rect x="34" y="40" width="20" height="50" rx="7" fill="#2b1d17" stroke="#ff7a2f" strokeOpacity=".55" />
      <rect x="206" y="40" width="20" height="50" rx="7" fill="#2b1d17" stroke="#ff7a2f" strokeOpacity=".55" />
      <rect x="56" y="24" width="24" height="82" rx="9" fill="url(#gOr)" />
      <rect x="180" y="24" width="24" height="82" rx="9" fill="url(#gOr)" />
      <path d="M63 32v66M187 32v66" stroke="#fff" strokeOpacity=".38" strokeWidth="3" strokeLinecap="round" />
      <path d="M70 32v66M194 32v66" stroke="#000" strokeOpacity=".18" strokeWidth="2" />
    </svg>
  );
}
