// A single line icon in the site's icon style: a stockpot on the flame, lid rattling, steam escaping.
// Pure SVG and CSS, no scripts.
export function CookingLoader({ label = "Preparing your page" }: { label?: string }) {
  return (
    <div className="cook" role="img" aria-label={label}>
      <svg viewBox="0 0 64 64" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <g className="cook-steam">
          <path d="M9 24c-2.5-2.5 2.5-4 0-8" />
          <path d="M55 24c-2.5-2.5 2.5-4 0-8" style={{ animationDelay: ".7s" }} />
        </g>
        <g className="cook-lid">
          <path d="M16 28c0-6 7-9 16-9s16 3 16 9z" />
          <path d="M32 19v-2.5" />
          <circle cx="32" cy="14" r="2.3" />
        </g>
        <path d="M14 33v13a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4V33" />
        <path d="M14 36H8M50 36h6" />
        <path d="M14 33h36" />
        <g className="cook-flames">
          <path d="M22 59c-1.5-2 1.5-3 0-5.5" />
          <path d="M32 60c-1.5-2 1.5-3 0-5.5" style={{ animationDelay: ".15s" }} />
          <path d="M42 59c-1.5-2 1.5-3 0-5.5" style={{ animationDelay: ".3s" }} />
        </g>
      </svg>
      <span className="cook-text">{label}</span>
      <span className="cook-bar" aria-hidden><i /></span>
    </div>
  );
}
