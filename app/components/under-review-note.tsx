export default function UnderReviewNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="text-xs text-amber-800 my-3">
      {count.toLocaleString("en-US")} {count === 1 ? "row" : "rows"} under review {count === 1 ? "is" : "are"} not counted
    </p>
  );
}
