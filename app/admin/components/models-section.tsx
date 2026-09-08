/** Configured filing-model roles, not live usage or provider pricing. */
export function ModelsSection() {
  return (
    <section className="mt-10">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Configured filing models
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        Defaults configured in the repository. A run may use an override or cached
        evidence; this table does not report which models ran most recently.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-neutral-300 text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2 pr-3 font-medium">Model</th>
              <th className="pb-2 pr-3 font-medium">Role</th>
              <th className="pb-2 font-medium">Configuration</th>
            </tr>
          </thead>
          <tbody className="text-neutral-600">
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-mono">claude-sonnet-4-6</td>
              <td className="py-2 pr-3">Primary PDF read</td>
              <td className="py-2"><code>scripts/parse-pdf.ts</code></td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-mono">gpt-6-astra</td>
              <td className="py-2 pr-3">Independent second read when needed</td>
              <td className="py-2"><code>lib/second-read.ts</code></td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-mono">grok-4.6</td>
              <td className="py-2 pr-3">Page-image audit</td>
              <td className="py-2"><code>lib/grok-audit.ts</code></td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-mono">claude-opus-4-8</td>
              <td className="py-2 pr-3">Optional summary and digest prose</td>
              <td className="py-2">
                <code>scripts/refresh-summaries.ts</code><br />
                <code>scripts/generate-digest-lede.ts</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500 mt-3">
        Actual cost depends on document size, model, retries and cache use. Review
        the run estimate and provider billing before paid work. Text extraction
        and OCR are separate checks; they do not use these model APIs. Ask has
        its own model configuration in <code>lib/ask/</code>.
      </p>
    </section>
  );
}
