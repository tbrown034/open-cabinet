import { readSourceAvailability, sourceKey, sourceAvailabilityLabel } from "@/lib/source-availability";
import { formatDate } from "@/lib/format";

export default function SourceAvailabilityNote({ url }: { url: string | null | undefined }) {
  const report = readSourceAvailability();
  const check = url && report?.filings[sourceKey(url)];
  const label = check ? sourceAvailabilityLabel(check) : null;
  if (!label || !report) return null;
  return <span className="block text-xs text-amber-800 whitespace-normal">
    {label}. Checked {formatDate(report.checkedAt.slice(0, 10))}.
  </span>;
}
