import type { AlertSignup } from "../types";

/** Email alert signups table with CSV export. */
export function AlertSignupsSection({
  signups,
  count,
}: {
  signups: AlertSignup[];
  count: number;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Alert Signups
          {count > 0 && (
            <span className="ml-2 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-sm text-[10px]">
              {count}
            </span>
          )}
        </h2>
        <a
          href="/api/admin/alerts?format=csv"
          className="text-xs border border-neutral-300 text-neutral-700 px-3 py-1.5 hover:bg-neutral-50 transition-colors"
        >
          Export CSV
        </a>
      </div>

      {signups.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
                <th className="pb-2 pr-3 font-medium">Email</th>
                <th className="pb-2 pr-3 font-medium">Confirmed</th>
                <th className="pb-2 pr-3 font-medium">Follows</th>
                <th className="pb-2 pr-3 font-medium">Source</th>
                <th className="pb-2 pr-3 font-medium">Official</th>
                <th className="pb-2 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((signup) => (
                <tr key={signup.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 text-neutral-900">{signup.email}</td>
                  <td className="py-2 pr-3">
                    {signup.confirmedAt ? (
                      <span className="text-emerald-700">
                        Confirmed{" "}
                        {new Date(signup.confirmedAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                    ) : (
                      <span className="text-neutral-400">{signup.status}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">
                    {signup.officialSlug ? "One official" : "All officials"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-500">
                    {signup.sourcePage || "—"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-500">
                    {signup.officialSlug || "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-neutral-400">
                    {new Date(signup.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">No filing-alert signups yet.</p>
      )}
    </section>
  );
}
