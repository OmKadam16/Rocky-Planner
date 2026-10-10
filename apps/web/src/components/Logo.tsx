// Rocky logomark: rounded square, three vertical white bars (tall middle).
export function Logo({ size = 32 }: { size?: number }) {
  const barW = Math.max(2, size * 0.094);
  const gap = Math.max(2, size * 0.094);
  const padB = size * 0.22;
  const heights = [size * 0.25, size * 0.47, size * 0.31];
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        minWidth: 20,
        minHeight: 20,
        borderRadius: size * 0.31,
      }}
      className="grid shrink-0 place-items-center bg-accent"
    >
      <span className="flex items-end" style={{ gap, paddingBottom: padB }}>
        {heights.map((h, i) => (
          <span
            key={i}
            className="block bg-white"
            style={{ width: barW, height: h, borderRadius: barW / 2 }}
          />
        ))}
      </span>
    </span>
  );
}
