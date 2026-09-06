import type { RowVerification } from "@/lib/row-verification";

const SCORE_LABEL = {
  3: "Checked",
  2: "Checked by two models",
  1: "Not yet checked",
  0: "Under review",
} as const;

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
        {verification ? SCORE_LABEL[verification.score] : "Not yet checked"}
      </summary>
      <p className="mt-1 max-w-sm leading-relaxed">
        {verification?.note ?? "No verification record is available for this row"}
      </p>
    </details>
  );
}
