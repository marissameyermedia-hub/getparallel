// P// circle mark — canonical React component.
// Locked spec: Notion Brand Identity page, May 17, 2026.
// Inter 900 · -0.04em letter-spacing · universal colors (light or dark context).
// Void #0D0D0F circle · White #FFFFFF P · Soft Violet #A98FD0 //
// Use everywhere inside the app (nav, icon) and at small sizes (<80px wide).

interface ParaelCircleProps {
  /** Full canvas size in px. The disc fills 90% of this. Default: 64. */
  size?: number;
}

export function ParaelCircle({ size = 64 }: ParaelCircleProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      role="img"
      aria-label="Parallel"
    >
      <div
        style={{
          width: size * 0.9,
          height: size * 0.9,
          borderRadius: '50%',
          background: '#0D0D0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden="true"
      >
        <span
          style={{
            fontFamily: 'Inter, -apple-system, sans-serif',
            fontWeight: 900,
            fontSize: size * 0.30,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            WebkitFontSmoothing: 'antialiased',
            color: '#FFFFFF',
            transform: 'translateY(-2%)',
            display: 'inline-block',
          }}
        >
          P<span style={{ color: '#A98FD0', marginLeft: '0.5%' }}>//</span>
        </span>
      </div>
    </div>
  );
}

export default ParaelCircle;
