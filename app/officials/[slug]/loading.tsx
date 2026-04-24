export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 animate-pulse">
      <div className="h-3 w-32 bg-neutral-100" />

      <header className="mt-6 mb-12 flex items-start gap-4">
        <div className="w-[72px] h-[72px] rounded-full bg-neutral-100 shrink-0" />
        <div className="flex-1">
          <div className="h-9 w-64 bg-neutral-200 mb-3" />
          <div className="h-4 w-80 bg-neutral-100" />
        </div>
      </header>

      <div className="h-16 bg-neutral-50 border-l-2 border-neutral-100 mb-10" />

      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-neutral-200 pb-6 mb-10">
        <div className="h-7 w-20 bg-neutral-100" />
        <div className="h-7 w-20 bg-neutral-100" />
        <div className="h-7 w-24 bg-neutral-100" />
        <div className="h-7 w-40 bg-neutral-100" />
      </div>

      <div className="h-80 bg-neutral-50 mb-10" />

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 bg-neutral-50" />
        ))}
      </div>
    </div>
  );
}
