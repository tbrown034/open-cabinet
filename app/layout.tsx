import type { Metadata } from "next";
import { DM_Sans, DM_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import MobileNav from "./components/mobile-nav";
import { Analytics } from "@vercel/analytics/next";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://open-cabinet.org"),
  title: "Open Cabinet — Executive Branch Stock Tracker",
  description:
    "Track financial transactions of cabinet secretaries, agency heads and senior government officials. Data from the U.S. Office of Government Ethics.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Open Cabinet — Executive Branch Stock Tracker",
    description:
      "34 officials. 3,300+ transactions. ~$2.8B estimated value. An interactive financial disclosure and conflict-of-interest tracker for the executive branch.",
    type: "website",
    siteName: "Open Cabinet",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmMono.variable} ${sourceSerif.variable} antialiased`}
    >
      <body className="bg-white text-neutral-900 font-[family-name:var(--font-dm-sans)]">
        {/* Thin accent bar — signals "publication" not "app" */}
        <div className="h-[3px] bg-neutral-800 w-full" />
        <header className="border-b border-neutral-200 relative">
          <nav className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
            <Link href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-c.svg"
                alt="Open Cabinet"
                className="h-8"
              />
            </Link>

            {/* Desktop nav — hidden on mobile */}
            <div className="hidden md:flex items-center gap-5 text-sm text-neutral-500">
              <Link href="/#directory" className="hover:text-neutral-900 transition-colors">Directory</Link>
              <Link href="/all" className="hover:text-neutral-900 transition-colors">All Trades</Link>
              <Link href="/companies" className="hover:text-neutral-900 transition-colors">Companies</Link>
              <Link href="/dashboard" className="hover:text-neutral-900 transition-colors">Overview</Link>
              <Link href="/late-filings" className="hover:text-neutral-900 transition-colors">Late Filings</Link>
              <Link href="/methodology" className="hover:text-neutral-900 transition-colors">Methodology</Link>
              <Link href="/about" className="hover:text-neutral-900 transition-colors">About</Link>
            </div>

            {/* Mobile hamburger */}
            <div className="flex md:hidden items-center">
              <MobileNav />
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="border-t border-neutral-200 bg-stone-50">
          <div className="mx-auto max-w-5xl px-4 py-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
              {/* Brand */}
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-c.svg" alt="Open Cabinet" className="h-6 opacity-60" />
                <p className="text-xs text-neutral-400">
                  Executive branch stock tracker
                </p>
              </div>

              {/* Nav */}
              <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500">
                <Link href="/#directory" className="hover:text-neutral-900 transition-colors">Directory</Link>
                <Link href="/all" className="hover:text-neutral-900 transition-colors">All Trades</Link>
                <Link href="/companies" className="hover:text-neutral-900 transition-colors">Companies</Link>
                <Link href="/dashboard" className="hover:text-neutral-900 transition-colors">Overview</Link>
                <Link href="/download" className="hover:text-neutral-900 transition-colors">Download</Link>
                <Link href="/methodology" className="hover:text-neutral-900 transition-colors">Methodology</Link>
                <Link href="/about" className="hover:text-neutral-900 transition-colors">About</Link>
              </nav>
            </div>

            {/* Other projects by Trevor */}
            <div className="mt-8 pt-6 border-t border-neutral-200">
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
                More government accountability tools
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
                <a
                  href="https://capitolreleases.com"
                  className="hover:text-neutral-900 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Capitol Releases
                </a>
                <span className="text-neutral-400">— Senate press-release archive, 100 senators, updated 4&times; daily</span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600 mt-1">
                <a
                  href="https://delegation-decoded.vercel.app"
                  className="hover:text-neutral-900 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Delegation Decoded
                </a>
                <span className="text-neutral-400">— Congressional tracking by state delegation: trades, bills, committees</span>
              </div>
            </div>

            {/* Attribution + legal */}
            <div className="mt-8 pt-6 border-t border-neutral-200 text-[11px] text-neutral-400 leading-relaxed space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p>
                  Data from the{" "}
                  <a
                    href="https://extapps2.oge.gov/201/Presiden.nsf"
                    className="underline hover:text-neutral-600"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    U.S. Office of Government Ethics
                  </a>
                  . For informational and journalism purposes only. Not investment advice.
                </p>
                <p className="whitespace-nowrap">
                  Built by{" "}
                  <a
                    href="https://trevorthewebdeveloper.com"
                    className="underline hover:text-neutral-600"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Trevor Brown
                  </a>
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <a
                  href="https://github.com/tbrown034/open-cabinet"
                  className="underline hover:text-neutral-600"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source code
                </a>
                <a
                  href="https://github.com/tbrown034/open-cabinet/issues"
                  className="underline hover:text-neutral-600"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Report a bug
                </a>
                <a
                  href="mailto:trevorbrown.web@gmail.com"
                  className="underline hover:text-neutral-600"
                >
                  Contact
                </a>
                <a href="https://github.com/tbrown034/open-cabinet/blob/main/LICENSE" className="underline hover:text-neutral-600" target="_blank" rel="noopener noreferrer">MIT License</a>
              </div>
            </div>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
