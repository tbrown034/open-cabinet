export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 animate-pulse">
      <div className="h-10 w-48 bg-neutral-200 mb-4" />
      <div className="h-4 w-full max-w-xl bg-neutral-100 mb-10" />

      <div className="h-10 bg-neutral-50 mb-10" />

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-neutral-50 border border-neutral-100" />
        ))}
      </div>
    </div>
  );
}
