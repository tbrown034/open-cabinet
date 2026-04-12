export default function Explainer() {
  return (
    <section className="bg-stone-50 -mx-4 px-4 py-16 mt-12">
      <div className="mx-auto max-w-5xl space-y-16">
        <div>
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-2xl text-neutral-900 mb-4">
            The Law
          </h2>
          <p className="text-neutral-600 max-w-2xl leading-relaxed">
            The Stop Trading on Congressional Knowledge Act (STOCK Act) of 2012
            requires senior federal officials to disclose securities transactions
            over $1,000 within 30 days and file a public report within 45 days.
            Failure to comply can result in civil penalties and disciplinary
            action.
          </p>
          <p className="text-neutral-500 text-sm mt-3 max-w-2xl">
            Congress has at least 19 tools tracking its own members{"'"} trades.
            The executive branch — with the same disclosure requirements — has
            had none until now.
          </p>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-2xl text-neutral-900 mb-4">
            The Filing Process
          </h2>
          <div className="flex flex-wrap gap-0 items-center text-sm">
            {[
              { step: "Nominated", desc: "President selects" },
              { step: "Disclosure", desc: "Files financial report" },
              { step: "Ethics Agreement", desc: "Signs divestiture plan" },
              { step: "Confirmed", desc: "90-day clock starts" },
              { step: "Ongoing Reporting", desc: "Every trade disclosed" },
              { step: "Compliance", desc: "Ethics office certifies" },
            ].map((item, i) => (
              <div key={i} className="flex items-center">
                <div className="bg-white border border-neutral-200 px-3 py-2 text-center min-w-[120px]">
                  <div className="font-medium text-neutral-900 text-xs">
                    {item.step}
                  </div>
                  <div className="text-neutral-400 text-[10px] mt-0.5">
                    {item.desc}
                  </div>
                </div>
                {i < 5 && (
                  <div className="text-neutral-300 px-1 text-lg shrink-0">
                    &rarr;
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-2xl text-neutral-900 mb-4">
            How We Get the Data
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-neutral-900 font-medium mb-1">
                1. OGE publishes PDFs
              </div>
              <p className="text-neutral-500">
                The Office of Government Ethics posts financial disclosure
                reports as PDF documents on their public portal.
              </p>
            </div>
            <div>
              <div className="text-neutral-900 font-medium mb-1">
                2. We parse transactions
              </div>
              <p className="text-neutral-500">
                Each PDF is read and every transaction is extracted: asset name,
                ticker, type (sale/purchase), date, amount range, and filing
                status.
              </p>
            </div>
            <div>
              <div className="text-neutral-900 font-medium mb-1">
                3. Data becomes searchable
              </div>
              <p className="text-neutral-500">
                Structured data powers timelines, company lookups, and aggregate
                analysis. Currently tracking 29 officials with 2,100+
                transactions.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="font-[family-name:var(--font-instrument-serif)] text-2xl text-neutral-900 mb-4">
            What to Watch For
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
                  Officials must report within 30 days. Late filings may
                  indicate compliance issues — though they are common and not
                  necessarily evidence of wrongdoing.
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
      </div>
    </section>
  );
}
