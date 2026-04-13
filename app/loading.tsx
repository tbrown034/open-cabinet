export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-32 flex flex-col items-center">
      <div className="flex gap-1.5 mb-4">
        <div className="w-2 h-2 rounded-full bg-neutral-300 animate-pulse" style={{ animationDelay: "0ms" }} />
        <div className="w-2 h-2 rounded-full bg-neutral-300 animate-pulse" style={{ animationDelay: "150ms" }} />
        <div className="w-2 h-2 rounded-full bg-neutral-300 animate-pulse" style={{ animationDelay: "300ms" }} />
      </div>
      <p className="text-sm text-neutral-400">Loading</p>
    </div>
  );
}
