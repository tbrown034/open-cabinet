import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for the four alert pages — the two status pages (confirmed /
 * unsubscribed) and the two interstitials (confirm / unsubscribe forms). They
 * all share the same heading + body + back-link layout, so copy/style edits
 * land in one place. `children` slots in the interstitial POST form (nothing on
 * the plain status pages).
 */
export default function StatusShell({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-20 pb-16">
      <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4 leading-tight">
        {heading}
      </h1>
      <p className="text-neutral-500 leading-relaxed mb-8">{body}</p>
      {children}
      <Link href="/" className="text-sm text-neutral-900 underline hover:text-neutral-600">
        Back to Open Cabinet
      </Link>
    </div>
  );
}
