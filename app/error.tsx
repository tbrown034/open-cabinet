"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in Vercel runtime logs for post-mortem.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
        Something went wrong
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        An error occurred while loading this page. The data source may be
        temporarily unavailable.
      </p>
      <button
        onClick={() => reset()}
        className="bg-neutral-900 text-white px-5 py-2 text-sm hover:bg-neutral-800 transition-colors cursor-pointer"
      >
        Try again
      </button>
      <p className="text-xs text-neutral-400 mt-8">
        If this persists, please{" "}
        <a
          href="https://github.com/tbrown034/open-cabinet/issues"
          className="underline hover:text-neutral-600"
          target="_blank"
          rel="noopener noreferrer"
        >
          report it
        </a>
        .
      </p>
      {error.digest && (
        <p className="text-[11px] text-neutral-300 mt-6 font-[family-name:var(--font-dm-mono)]">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
