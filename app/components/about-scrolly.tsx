"use client";

import { useState, useEffect, useRef } from "react";

// ── SECTION 1: THE LAW ──

const LAW_STEPS = [
  {
    id: "stock-act",
    label: "The STOCK Act",
    title: "Congress strengthened the rules in 2012",
    body: "The Ethics in Government Act of 1978 created financial disclosure requirements after Watergate. The STOCK Act of 2012 added periodic transaction reporting — requiring officials to disclose individual stock trades over $1,000 within days, not just annually. The law covers both Congress and the executive branch.",
  },
  {
    id: "30-day",
    label: "30-day window",
    title: "Report every trade within 30 days",
    body: "Officials must file a 278-T Periodic Transaction Report within 30 days of being notified of a trade, or 45 days after the transaction itself — whichever comes first. The 45-day mark is the hard backstop. If both deadlines pass, the filing is late.",
  },
  {
    id: "divestiture",
    label: "90-day divestiture",
    title: "Sell your conflicts within 90 days",
    body: "Before confirmation, nominees sign an ethics agreement pledging to divest holdings that conflict with their new role. They have 90 days from confirmation to complete the sales. This only covers conflicting assets — officials can keep and trade non-conflicting stocks.",
  },
  {
    id: "extensions",
    label: "Extensions",
    title: "Deadlines can be extended",
    body: "OGE can grant extensions on divestiture deadlines. Some assets — especially private equity, real estate LLCs, and illiquid holdings — take longer to sell. Officials must request the extension and demonstrate good-faith effort. The ethics agreement remains binding.",
  },
  {
    id: "late-filings",
    label: "Late filings",
    title: "Missing the deadline is common",
    body: "A \"late filing\" means the official knew about a trade for more than 30 days before reporting it. The penalty is a $200 fee — routinely waived. A 2022 Business Insider investigation found at least 72 members of Congress violated the same deadline. No executive branch official has ever been meaningfully sanctioned for late 278-T filings.",
  },
  {
    id: "consequences",
    label: "Consequences",
    title: "What happens when officials don't comply",
    body: "Late disclosure carries a $200 fee. But taking official action on matters affecting your financial holdings is a potential criminal violation under 18 U.S.C. Section 208. The distinction matters: late reporting is a paperwork problem; participating in decisions while financially conflicted is a federal crime carrying up to five years in prison.",
  },
];

// ── SECTION 2: HOW THIS WAS BUILT ──

const BUILD_STEPS = [
  {
    id: "oge-api",
    label: "OGE API",
    title: "Start with the public records",
    body: "The Office of Government Ethics maintains a public API listing all financial disclosure filers. It returns 16,858 records — names, titles, agencies, filing types, and links to PDF documents. No authentication required. This is the entry point.",
  },
  {
    id: "filter",
    label: "Filter officials",
    title: "Find the ones with transaction reports",
    body: "Of those 16,858 records, 629 are 278-T Periodic Transaction Reports — the ongoing stock trade disclosures. These belong to 43 officials with publicly downloadable filings. Another 179 require individual Form 201 requests.",
  },
  {
    id: "parse-pdfs",
    label: "Parse PDFs",
    title: "Extract structured data from government forms",
    body: "Each 278-T is a PDF containing a table: asset description, transaction type (sale, purchase, exchange), date, amount range, and whether the filing was late. We parse these using Claude's API — reading each table row and outputting structured JSON.",
  },
  {
    id: "resolve-tickers",
    label: "Resolve tickers",
    title: "Match assets to ticker symbols",
    body: "Many filings list assets as \"Apple, Inc. (AAPL)\" — easy. Others say \"Goldman Sachs GQG Partners Intl Opps Fund\" with no ticker. We resolve what we can (578 tickers so far) and flag the rest. Private equity and real estate LLCs don't have tickers.",
  },
  {
    id: "build-viz",
    label: "Visualize",
    title: "Turn rows into timelines",
    body: "The structured JSON powers D3 visualizations: scatter-plot timelines for each official, a swim lane chart showing all 2,100+ trades on one canvas, treemaps for asset categories, and bar charts for company lookups. D3 computes the math; React renders the SVG.",
  },
  {
    id: "monitor",
    label: "Monitor",
    title: "Check for new filings automatically",
    body: "A monitoring script polls the OGE API for new filings, compares against what we already have, and flags additions. News coverage is tracked through AI-assisted search across major outlets. The goal is a living dataset, not a one-time snapshot.",
  },
  {
    id: "ai-role",
    label: "AI usage",
    title: "Where AI is and isn't involved",
    body: "PDF parsing uses Anthropic's Claude API (claude-haiku-4-5) to read table rows from government forms. Official summaries are AI-generated from parsed transaction data and reviewed for accuracy. News coverage is collected via AI-assisted web search. The application was built by Trevor Brown with the assistance of Claude Code (claude-opus-4-6). All AI outputs are verified against source documents — no AI-generated data is presented without a human-verifiable source.",
  },
];

function ScrollySection({
  title,
  subtitle,
  steps,
}: {
  title: string;
  subtitle: string;
  steps: typeof LAW_STEPS;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    stepRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveIndex(i);
          }
        },
        { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
      );
      observer.observe(ref);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4">
      <div className="mb-12">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-2">
          {title}
        </h2>
        <p className="text-neutral-500 text-sm max-w-xl">{subtitle}</p>
      </div>

      <div className="relative md:grid md:grid-cols-[1fr_1.2fr] md:gap-16">
        {/* Sticky progress — left side on desktop */}
        <div className="hidden md:block">
          <div className="sticky top-32">
            <div className="w-full max-w-sm mx-auto">
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />
                {steps.map((step, i) => {
                  const isActive = i === activeIndex;
                  const isPast = i < activeIndex;
                  const isFuture = i > activeIndex;
                  return (
                    <div
                      key={step.id}
                      className={`relative flex items-start gap-4 transition-all duration-500 ${
                        i < steps.length - 1 ? "pb-6" : ""
                      }`}
                    >
                      <div
                        className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-medium transition-all duration-500 shrink-0 ${
                          isActive
                            ? "bg-neutral-900 border-neutral-900 text-white scale-110"
                            : isPast
                            ? "bg-neutral-900 border-neutral-900 text-white"
                            : "bg-white border-neutral-300 text-neutral-400"
                        }`}
                      >
                        {isPast ? (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2 6L5 9L10 3"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <div
                        className={`pt-1 transition-all duration-500 ${
                          isFuture ? "opacity-30" : "opacity-100"
                        }`}
                      >
                        <div
                          className={`text-sm font-medium transition-colors duration-500 ${
                            isActive ? "text-neutral-900" : "text-neutral-500"
                          }`}
                        >
                          {step.label}
                        </div>
                        {isActive && (
                          <div className="text-xs text-neutral-400 mt-0.5">
                            Step {i + 1} of {steps.length}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Scrolling narrative cards */}
        <div className="space-y-8 md:space-y-32 md:py-24">
          {steps.map((step, i) => (
            <div
              key={step.id}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              className={`bg-white border border-neutral-200 p-6 transition-opacity duration-500 ${
                activeIndex === i ? "opacity-100" : "md:opacity-40"
              }`}
            >
              <div className="flex items-center gap-3 mb-3 md:hidden">
                <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-medium">
                  {i + 1}
                </div>
                <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                  {step.label}
                </span>
              </div>
              <h3 className="font-[family-name:var(--font-source-serif)] text-lg text-neutral-900 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AboutScrolly() {
  return (
    <div className="space-y-24">
      <section className="bg-stone-50 -mx-0 py-16">
        <ScrollySection
          title="The law and the deadlines"
          subtitle="What the STOCK Act requires, how divestiture works, and what happens when officials miss their deadlines."
          steps={LAW_STEPS}
        />
      </section>

      <section className="bg-stone-50 -mx-0 py-16">
        <ScrollySection
          title="How this was built"
          subtitle="From government PDFs to searchable data — the pipeline behind Open Cabinet."
          steps={BUILD_STEPS}
        />
      </section>
    </div>
  );
}
