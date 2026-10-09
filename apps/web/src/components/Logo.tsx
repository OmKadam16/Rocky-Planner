export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, minWidth: 20, minHeight: 20 }}
      className="grid shrink-0 place-items-center rounded-[10px] bg-accent"
    >
      <span className="flex flex-col gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-[2.5px] w-4 rounded-full bg-white" />
        ))}
      </span>
    </span>
  );
}
