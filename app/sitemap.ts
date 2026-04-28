import type { MetadataRoute } from "next";
import { getOfficialsIndex, getAllTickers } from "@/lib/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://open-cabinet.org";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/all`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/companies`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/late-filings`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/download`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  try {
    const index = await getOfficialsIndex();
    const officialRoutes: MetadataRoute.Sitemap = index.officials.map((o) => ({
      url: `${base}/officials/${o.slug}`,
      lastModified: o.mostRecentFilingDate ? new Date(o.mostRecentFilingDate) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const tickers = await getAllTickers();
    const companyRoutes: MetadataRoute.Sitemap = tickers.map((t) => ({
      url: `${base}/companies/${encodeURIComponent(t.toLowerCase())}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    return [...staticRoutes, ...officialRoutes, ...companyRoutes];
  } catch {
    return staticRoutes;
  }
}
