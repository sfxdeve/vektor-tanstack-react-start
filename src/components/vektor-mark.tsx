export function VektorMark({ className = "h-7 w-7 text-sm" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-sm bg-teal-500 font-heading font-black text-zinc-950 ${className}`}
    >
      V
    </span>
  );
}
