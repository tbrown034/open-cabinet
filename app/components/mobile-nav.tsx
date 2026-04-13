"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/#directory", label: "Directory" },
  { href: "/all", label: "All Trades" },
  { href: "/companies", label: "Companies" },
  { href: "/dashboard", label: "Overview" },
  { href: "/late-filings", label: "Late Filings" },
  { href: "/about", label: "About" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden p-1.5 -mr-1.5 cursor-pointer"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-neutral-700"
        >
          {open ? (
            <>
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </>
          ) : (
            <>
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </>
          )}
        </svg>
      </button>

      {/* Dropdown menu — mobile only */}
      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-neutral-200 z-50">
          <div className="mx-auto max-w-5xl px-4 py-3 flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`text-sm py-1.5 transition-colors ${
                  pathname === link.href
                    ? "text-neutral-900 font-medium"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
