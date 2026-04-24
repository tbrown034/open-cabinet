export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 animate-pulse">
      <div className="h-3 w-40 bg-neutral-100 mb-6" />

      <div className="h-10 w-48 bg-neutral-200 mb-3" />
      <div className="h-4 w-96 bg-neutral-100 mb-10" />

      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-neutral-200 pb-6 mb-10">
        <div className="h-7 w-24 bg-neutral-100" />
        <div className="h-7 w-24 bg-neutral-100" />
        <div className="h-7 w-28 bg-neutral-100" />
      </div>

      <div className="h-72 bg-neutral-50 mb-10" />

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-neutral-50" />
        ))}
      </div>
    </div>
  );
}
