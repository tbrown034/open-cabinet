export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 animate-pulse">
      <header className="mb-10">
        <div className="h-10 w-48 bg-neutral-200 mb-4" />
        <div className="h-4 w-full max-w-xl bg-neutral-100 mb-2" />
        <div className="h-4 w-3/4 max-w-xl bg-neutral-100" />
        <div className="flex gap-6 mt-4">
          <div className="h-4 w-32 bg-neutral-100" />
          <div className="h-4 w-32 bg-neutral-100" />
          <div className="h-4 w-24 bg-neutral-100" />
        </div>
      </header>

      <div className="space-y-[6px]">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-[34px] bg-neutral-50" />
        ))}
      </div>
    </div>
  );
}
