import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
        Page not found
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        The page you{"'"}re looking for doesn{"'"}t exist or has been moved.
      </p>
      <Link
        href="/"
        className="bg-neutral-900 text-white px-5 py-2 text-sm hover:bg-neutral-800 transition-colors inline-block"
      >
        Back to directory
      </Link>
    </div>
  );
}
