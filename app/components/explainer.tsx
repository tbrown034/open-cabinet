"use client";

import { useState, useEffect, useRef } from "react";

const STEPS = [
  {
    id: "nominated",
    label: "Nominated",
    title: "The president nominates a candidate",
    body: "When the president selects someone for a cabinet or senior position, the ethics clock starts. The nominee must disclose every financial holding before confirmation hearings begin, as required by the Ethics in Government Act (Pub. L. 95-521).",
  },
  {
    id: "disclosure",
    label: "Disclosure",
    title: "They file a financial report",
    body: "The nominee submits a Public Financial Disclosure Report (OGE Form 278e) listing all assets, income sources, liabilities and positions held (5 U.S.C. \u00A713104). This is the baseline portrait of their financial life.",
  },
  {
    id: "ethics",
    label: "Ethics Agreement",
    title: "They sign a divestiture plan",
    body: "The Office of Government Ethics reviews the disclosure and negotiates an ethics agreement. The nominee pledges to sell conflicting holdings — usually within 90 days of confirmation. Sales may qualify for tax deferral under a Certificate of Divestiture (26 U.S.C. \u00A71043).",
  },
  {
    id: "confirmed",
    label: "Confirmed",
    title: "The 90-day clock starts",
    body: "Once the Senate confirms the nominee, they have 90 days to divest the stocks and assets identified in their ethics agreement. This is where Open Cabinet starts watching.",
  },
  {
    id: "reporting",
    label: "Ongoing",
    title: "Every trade gets disclosed",
    body: "Under the STOCK Act (5 U.S.C. \u00A713104), officials must report individual securities transactions over $1,000 within 30 days of notification — or 45 days of the trade, whichever comes first (5 U.S.C. \u00A713105(l)). Mutual funds and ETFs are exempt (5 CFR \u00A72640.201). These are filed as OGE Form 278-T reports — the core data that powers this tracker.",
  },
  {
    id: "compliance",
    label: "Compliance",
    title: "The ethics office certifies",
    body: "OGE reviews whether the official met their divestiture deadline and continues to comply with ethics agreements. Late filings carry a $200 fee (5 U.S.C. \u00A713106(a)). Missed deadlines and new purchases in regulated sectors all raise flags — criminal conflict of interest is covered by 18 U.S.C. \u00A7208.",
  },
];

function TimelineViz({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />

        {STEPS.map((step, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          const isFuture = i > activeIndex;

          return (
            <div
              key={step.id}
              className={`relative flex items-start gap-4 transition-all duration-500 ${
                i < STEPS.length - 1 ? "pb-6" : ""
              }`}
            >
              {/* Dot */}
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
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
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

              {/* Label */}
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
                    Step {i + 1} of {STEPS.length}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Explainer() {
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
    <section className="bg-stone-50 -mx-4 px-4 py-16 mt-12">
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <div className="mb-12">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-2">
            How disclosure works
          </h2>
          <p className="text-neutral-500 text-sm max-w-xl">
            From nomination to compliance — the process every senior official
            goes through under the STOCK Act and federal ethics law.
          </p>
        </div>

        {/* Scrollytelling layout */}
        <div className="relative md:grid md:grid-cols-[1fr_1.2fr] md:gap-16">
          {/* Sticky viz — left side on desktop, top on mobile */}
          <div className="hidden md:block">
            <div className="sticky top-32">
              <TimelineViz activeIndex={activeIndex} />
            </div>
          </div>

          {/* Scrolling narrative — right side */}
          <div className="space-y-8 md:space-y-32 md:py-24">
            {STEPS.map((step, i) => (
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

        {/* What to watch for — below the scrollytelling */}
        <div className="mt-16 pt-12 border-t border-neutral-200">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-6">
            What to watch for
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
            <div className="flex gap-3">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-600 opacity-70 mt-1 shrink-0" />
              <div>
                <div className="text-neutral-900 font-medium">
                  Purchases while in office
                </div>
                <p className="text-neutral-500 mt-1">
                  Most officials sell holdings upon confirmation. New purchases
                  — especially in sectors they regulate — warrant scrutiny.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-600 opacity-70 mt-1 shrink-0" />
              <div>
                <div className="text-neutral-900 font-medium">
                  Late filings
                </div>
                <p className="text-neutral-500 mt-1">
                  Officials must report within 30 days of notification or 45
                  days of the trade (5 U.S.C. {"\u00A7"}13105(l)). Late filings are
                  common and not necessarily evidence of wrongdoing — but
                  patterns matter.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="inline-block w-3 h-3 rounded-full bg-red-600 opacity-70 mt-1 shrink-0" />
              <div>
                <div className="text-neutral-900 font-medium">
                  Regulated-sector holdings
                </div>
                <p className="text-neutral-500 mt-1">
                  Officials trading stocks in industries their agency oversees
                  creates potential conflicts. Ethics agreements typically
                  require divestiture.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* How we get the data */}
        <div className="mt-16 pt-12 border-t border-neutral-200">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-6">
            How we get the data
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-neutral-900 font-medium mb-1">
                1. OGE publishes PDFs
              </div>
              <p className="text-neutral-500">
                The Office of Government Ethics posts financial disclosure
                reports as PDF documents on their public portal, as required
                by 5 U.S.C. {"\u00A7"}13107.
              </p>
            </div>
            <div>
              <div className="text-neutral-900 font-medium mb-1">
                2. We parse transactions
              </div>
              <p className="text-neutral-500">
                Each PDF is read and every transaction is extracted: asset name,
                ticker, type (sale/purchase), date, amount range and filing
                status.
              </p>
            </div>
            <div>
              <div className="text-neutral-900 font-medium mb-1">
                3. Data becomes searchable
              </div>
              <p className="text-neutral-500">
                Structured data powers timelines, company lookups and aggregate
                analysis. Currently tracking 29 officials with 2,100+
                transactions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
