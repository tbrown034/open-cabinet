import type { Metadata } from "next";
import { DM_Sans, DM_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-neutral-900 font-[family-name:var(--font-dm-sans)]">
        <header className="border-b border-neutral-200">
          <nav className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo-cabinet.svg"
                alt=""
                width={22}
                height={22}
                className="opacity-80"
              />
              <span className="text-lg font-semibold tracking-tight text-neutral-900">
                Open Cabinet
              </span>
            </Link>
            <div className="flex gap-6 text-sm text-neutral-500">
              <Link
                href="/"
                className="hover:text-neutral-900 transition-colors"
              >
                Directory
              </Link>
              <Link
                href="/about"
                className="hover:text-neutral-900 transition-colors"
              >
                About
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-200 mt-16">
          <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-neutral-400 leading-relaxed">
            <p>
              Data sourced from financial disclosures filed with the{" "}
              <a
                href="https://extapps2.oge.gov/201/Presiden.nsf"
                className="underline hover:text-neutral-600"
                target="_blank"
                rel="noopener noreferrer"
              >
                U.S. Office of Government Ethics
              </a>{" "}
              under the Ethics in Government Act. This tool is for informational
              and journalism purposes only.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
