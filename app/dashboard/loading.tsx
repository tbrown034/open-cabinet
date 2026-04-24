export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 animate-pulse">
      <div className="h-10 w-56 bg-neutral-200 mb-4" />
      <div className="h-4 w-full max-w-xl bg-neutral-100 mb-10" />

      <div className="h-12 bg-neutral-50 mb-10" />
      <div className="h-64 bg-neutral-50 mb-10" />

      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-8 bg-neutral-50" />
        ))}
      </div>
    </div>
  );
}
