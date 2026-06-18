type ProjectCrossPromoProps = {
  placement?: "home" | "footer";
};

const projects = [
  {
    name: "Capitol Releases",
    href: "https://capitolreleases.com/?utm_source=open-cabinet&utm_medium=referral&utm_campaign=accountability-tools",
    description:
      "Senate press releases from all 100 senators, searchable and updated throughout the day.",
  },
  {
    name: "Delegation Decoded",
    href: "https://delegation-decoded.vercel.app/?utm_source=open-cabinet&utm_medium=referral&utm_campaign=accountability-tools",
    description:
      "State-by-state congressional delegation tracking for trades, bills, committees and campaign money.",
  },
];

export default function ProjectCrossPromo({
  placement = "home",
}: ProjectCrossPromoProps) {
  if (placement === "footer") {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
          More government accountability tools
        </p>
        <div className="space-y-1">
          {projects.map((project) => (
            <div
              key={project.name}
              className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-600"
            >
              <a
                href={project.href}
                className="hover:text-neutral-900 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {project.name}
              </a>
              <span className="text-neutral-400">{project.description}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="bg-neutral-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
              More from Trevor Brown
            </p>
            <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-white">
              Other public accountability tools
            </h2>
            <p className="mt-2 text-sm text-neutral-300 leading-relaxed">
              Open Cabinet is part of a small set of searchable government-data
              projects built for reporters, researchers and civic readers.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 md:flex-1">
            {projects.map((project) => (
              <a
                key={project.name}
                href={project.href}
                className="border border-neutral-700 px-4 py-3 text-sm hover:border-white hover:bg-white hover:text-neutral-900 transition-colors group"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="font-medium underline group-hover:no-underline">
                  {project.name}
                </span>
                <span className="block mt-1 text-xs text-neutral-400 group-hover:text-neutral-600 leading-relaxed">
                  {project.description}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
