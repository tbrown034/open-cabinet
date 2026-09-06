import { SHORT_LABEL, type RowVerification } from "@/lib/row-verification";

export default function VerificationMarker({
  verification,
}: {
  verification: RowVerification | null;
}) {
  return (
    <details className="mt-1 text-xs text-neutral-600">
      <summary
        className={`cursor-pointer ${verification?.score === 0 ? "font-semibold text-amber-900" : ""}`}
        title={verification?.note ?? "No verification record is available for this row"}
      >
        {verification ? SHORT_LABEL[verification.state] : "Not yet checked"}
      </summary>
      <p className="mt-1 max-w-sm leading-relaxed">
        {verification?.note ?? "No verification record is available for this row"}
      </p>
    </details>
  );
}
