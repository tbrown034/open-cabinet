/** Reference table of the parser models and their per-token pricing. */
export function ModelsSection() {
  return (
    <section className="mt-10">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Models in Use
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-neutral-300 text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2 pr-3 font-medium">Model</th>
              <th className="pb-2 pr-3 font-medium">Provider</th>
              <th className="pb-2 pr-3 font-medium">Role</th>
              <th className="pb-2 pr-3 font-medium text-right">Input</th>
              <th className="pb-2 font-medium text-right">Output</th>
            </tr>
          </thead>
          <tbody className="text-neutral-600">
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">
                claude-sonnet-4-6
              </td>
              <td className="py-2 pr-3">Anthropic</td>
              <td className="py-2 pr-3">Default parser</td>
              <td className="py-2 pr-3 text-right tabular-nums">$3/M</td>
              <td className="py-2 text-right tabular-nums">$15/M</td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">
                claude-haiku-4-5
              </td>
              <td className="py-2 pr-3">Anthropic</td>
              <td className="py-2 pr-3">Budget option</td>
              <td className="py-2 pr-3 text-right tabular-nums">$1/M</td>
              <td className="py-2 text-right tabular-nums">$5/M</td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">
                claude-opus-4-6
              </td>
              <td className="py-2 pr-3">Anthropic</td>
              <td className="py-2 pr-3">Verification</td>
              <td className="py-2 pr-3 text-right tabular-nums">$5/M</td>
              <td className="py-2 text-right tabular-nums">$25/M</td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">
                gpt-5.4-mini
              </td>
              <td className="py-2 pr-3">OpenAI</td>
              <td className="py-2 pr-3">Cross-provider verify</td>
              <td className="py-2 pr-3 text-right tabular-nums">$0.75/M</td>
              <td className="py-2 text-right tabular-nums">$4.50/M</td>
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900">
                gpt-5.4-nano
              </td>
              <td className="py-2 pr-3">OpenAI</td>
              <td className="py-2 pr-3">Cheapest fallback</td>
              <td className="py-2 pr-3 text-right tabular-nums">$0.20/M</td>
              <td className="py-2 text-right tabular-nums">$1.25/M</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400 mt-3">
        Batch API: 50% discount on both providers. Per-PDF cost: ~$0.01 (Haiku)
        to ~$0.06 (Opus). Change default in scripts/parse-pdf.ts.
      </p>
    </section>
  );
}
