"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "@/lib/auth-client";

export default function AdminPage() {
  const { data: session, isPending } = useSession();

  const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  if (isPending) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-neutral-500 text-sm">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl text-neutral-900 mb-6">
          Admin
        </h1>
        <p className="text-neutral-500 text-sm mb-8">
          Sign in with Google to access the admin panel. Only whitelisted
          accounts are authorized.
        </p>
        <button
          onClick={async () => {
            const res = await signIn.social({
              provider: "google",
              callbackURL: "/admin",
            });
            // Better Auth returns {data: {url, redirect}, error}
            // The client should auto-redirect, but if not, do it manually
            const url = res?.data?.url;
            if (url && typeof url === "string" && url.startsWith("http")) {
              window.location.href = url;
            }
          }}
          className="border border-neutral-900 px-6 py-2.5 text-sm text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors cursor-pointer"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl text-neutral-900 mb-4">
          Access Denied
        </h1>
        <p className="text-neutral-500 text-sm mb-6">
          Signed in as {session.user.email}. This account is not authorized.
        </p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Home
          </Link>
          <button
            onClick={() =>
              signOut({
                fetchOptions: { onSuccess: () => window.location.reload() },
              })
            }
            className="border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-10">
        <div>
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl text-neutral-900 mb-1">
            Admin
          </h1>
          <p className="text-sm text-neutral-500">
            Signed in as {session.user.name || session.user.email}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/"
            className="border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Home
          </Link>
          <button
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => { window.location.href = "/"; },
                },
              })
            }
            className="border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* User info card */}
      <section className="border border-neutral-200 p-5 mb-6">
        <h2 className="font-medium text-neutral-900 mb-3">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-neutral-400">Name:</span>{" "}
            <span className="text-neutral-700">
              {session.user.name || "Not set"}
            </span>
          </div>
          <div>
            <span className="text-neutral-400">Email:</span>{" "}
            <span className="text-neutral-700">{session.user.email}</span>
          </div>
          <div>
            <span className="text-neutral-400">Role:</span>{" "}
            <span className="text-neutral-700">Administrator</span>
          </div>
          <div>
            <span className="text-neutral-400">Session:</span>{" "}
            <span className="text-neutral-700">Active</span>
          </div>
        </div>
      </section>

      {/* Data management */}
      <section className="border border-neutral-200 p-5 mb-6">
        <h2 className="font-medium text-neutral-900 mb-3">Data Management</h2>
        <div className="space-y-2 text-sm text-neutral-500">
          <p>
            <code className="bg-neutral-100 px-1.5 py-0.5 text-xs">
              pnpm run check-filings
            </code>{" "}
            — Check OGE for new 278-T filings
          </p>
          <p>
            <code className="bg-neutral-100 px-1.5 py-0.5 text-xs">
              pnpm run rebuild-index
            </code>{" "}
            — Regenerate officials index from JSON files
          </p>
          <p>
            <code className="bg-neutral-100 px-1.5 py-0.5 text-xs">
              pnpm run generate-exports
            </code>{" "}
            — Rebuild downloadable CSV/JSON exports
          </p>
        </div>
      </section>

      {/* Quick links */}
      <section className="border border-neutral-200 p-5">
        <h2 className="font-medium text-neutral-900 mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/dashboard"
            className="border border-neutral-200 px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/all"
            className="border border-neutral-200 px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            All Trades
          </Link>
          <Link
            href="/download"
            className="border border-neutral-200 px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Download Data
          </Link>
          <a
            href="https://extapps2.oge.gov/201/Presiden.nsf"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-neutral-200 px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            OGE Portal
          </a>
          <a
            href="https://github.com/tbrown034/open-cabinet-"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-neutral-200 px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
