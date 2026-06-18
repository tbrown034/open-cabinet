type ResearchContactCtaProps = {
  context?: "about" | "download";
};

export default function ResearchContactCta({
  context = "about",
}: ResearchContactCtaProps) {
  const subject =
    context === "download"
      ? "Open Cabinet data question"
      : "Open Cabinet research question";

  return (
    <section className="border border-neutral-200 bg-stone-50 px-5 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
            Using this data?
          </h2>
          <p className="mt-1 text-sm text-neutral-500 leading-relaxed">
            For reporting, research questions, attribution, data checks or
            custom pulls, contact Trevor Brown directly.
          </p>
        </div>
        <a
          href={`mailto:trevorbrown.web@gmail.com?subject=${encodeURIComponent(subject)}`}
          className="shrink-0 border border-neutral-900 px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors text-center"
        >
          Contact Trevor
        </a>
      </div>
    </section>
  );
}
