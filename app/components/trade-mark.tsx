import type { SVGProps } from "react";

/**
 * One disclosed trade: a circle for a sale, a square for a purchase.
 *
 * Buy/sell used to be carried by hue alone — #dc2626 against #16a34a, which
 * sit about 1.4:1 apart for a deuteranope, so roughly 8% of men could not
 * separate a sale from a purchase anywhere on the site. The diverging bar
 * charts were always fine because position does that work there; only the
 * dot views had the problem.
 *
 * Shape rather than fill-vs-hollow because the stroke is already spoken for:
 * it carries the late-filing flag. Colour stays as reinforcement.
 *
 * The square is sized to the SAME AREA as the circle it replaces, so the
 * "area scales with reported amount" property the scaleSqrt radius provides
 * is not quietly broken for half the marks. side = r·√π.
 */
const EQUAL_AREA_HALF_SIDE = Math.sqrt(Math.PI) / 2; // ≈ 0.886

export default function TradeMark({
  isSale,
  cx,
  cy,
  r,
  ...rest
}: {
  isSale: boolean;
  cx: number;
  cy: number;
  r: number;
} & Omit<SVGProps<SVGCircleElement & SVGRectElement>, "cx" | "cy" | "r">) {
  if (isSale) {
    return <circle cx={cx} cy={cy} r={r} {...rest} />;
  }
  const half = r * EQUAL_AREA_HALF_SIDE;
  return (
    <rect
      x={cx - half}
      y={cy - half}
      width={half * 2}
      height={half * 2}
      {...rest}
    />
  );
}

/** Legend swatches, so the key shows the same marks the chart draws. */
export function TradeMarkSwatch({
  isSale,
  size = 10,
}: {
  isSale: boolean;
  size?: number;
}) {
  const fill = isSale ? "#dc2626" : "#16a34a";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      {isSale ? (
        <circle cx="5" cy="5" r="4.2" fill={fill} opacity={0.85} />
      ) : (
        <rect x="1.3" y="1.3" width="7.4" height="7.4" fill={fill} opacity={0.85} />
      )}
    </svg>
  );
}
