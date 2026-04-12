import type { Metadata } from "next";
import { DM_Sans, DM_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import MobileNav from "./components/mobile-nav";
import AuthButton from "./components/auth-button";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Open Cabinet — Executive Branch Stock Tracker",
  description:
    "Track financial transactions of cabinet secretaries, agency heads, and senior government officials. Data from the U.S. Office of Government Ethics.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Open Cabinet — Executive Branch Stock Tracker",
    description:
      "29 officials. 2,100+ transactions. ~$3.6B estimated value. The first stock tracker for the executive branch.",
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
      className={`${dmSans.variable} ${dmMono.variable} ${instrumentSerif.variable} antialiased`}
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
              <Link href="/" className="hover:text-neutral-900 transition-colors">Directory</Link>
              <Link href="/dashboard" className="hover:text-neutral-900 transition-colors">Dashboard</Link>
              <Link href="/all" className="hover:text-neutral-900 transition-colors">All Trades</Link>
              <Link href="/companies" className="hover:text-neutral-900 transition-colors">Companies</Link>
              <Link href="/about" className="hover:text-neutral-900 transition-colors">About</Link>
              <span className="text-neutral-200">|</span>
              <AuthButton />
            </div>

            {/* Mobile: auth + hamburger */}
            <div className="flex md:hidden items-center gap-3">
              <AuthButton />
              <MobileNav />
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="border-t border-neutral-200">
          <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-neutral-400 leading-relaxed">
              <div>
                <p>
                  Source:{" "}
                  <a
                    href="https://extapps2.oge.gov/201/Presiden.nsf"
                    className="underline hover:text-neutral-600"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    U.S. Office of Government Ethics
                  </a>
                  {" · "}
                  <Link
                    href="/download"
                    className="underline hover:text-neutral-600"
                  >
                    Download data
                  </Link>
                </p>
                <p className="mt-1">
                  For informational and journalism purposes only. Not investment
                  advice.
                </p>
              </div>
              <div className="text-right">
                <p>
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
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
