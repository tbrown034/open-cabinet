import Link from "next/link";

/** Static shortcuts to site pages and external dashboards. */
export function QuickLinksSection() {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Quick Links
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
        >
          Directory
        </Link>
        <Link
          href="/late-filings"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
        >
          Late Filings
        </Link>
        <Link
          href="/download"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
        >
          Data exports
        </Link>
        <a
          href="https://vercel.com/tbrown034s-projects/open-cabinet/settings/cron-jobs"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vercel Cron
        </a>
        <a
          href="https://console.anthropic.com"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Anthropic Console
        </a>
        <a
          href="https://platform.openai.com/usage"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenAI Dashboard
        </a>
        <a
          href="https://console.neon.tech"
          className="border border-neutral-200 px-4 py-3 text-sm hover:bg-neutral-50 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Neon Database
        </a>
      </div>
    </section>
  );
}
