"use client";

import { useSession, signIn, signOut } from "@/lib/auth-client";

export default function AdminPage() {
  const { data: session, isPending } = useSession();

  const ADMIN_EMAIL = "trevorbrown.web@gmail.com";
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  if (isPending) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-neutral-500">
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
          onClick={() =>
            signIn.social({ provider: "google", callbackURL: "/admin" })
          }
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
          Signed in as {session.user.email}. This account is not authorized for
          admin access.
        </p>
        <button
          onClick={() => signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })}
          className="border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl text-neutral-900 mb-1">
            Admin
          </h1>
          <p className="text-sm text-neutral-500">
            Signed in as {session.user.email}
          </p>
        </div>
        <button
          onClick={() => signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })}
          className="border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>

      <div className="space-y-6">
        <section className="border border-neutral-200 p-5">
          <h2 className="font-medium text-neutral-900 mb-2">Data Management</h2>
          <p className="text-sm text-neutral-500">
            Run <code className="bg-neutral-100 px-1.5 py-0.5">pnpm run check-filings</code> to
            check for new OGE filings.
          </p>
          <p className="text-sm text-neutral-500 mt-1">
            Run <code className="bg-neutral-100 px-1.5 py-0.5">pnpm run rebuild-index</code> to
            regenerate the officials index.
          </p>
          <p className="text-sm text-neutral-500 mt-1">
            Run <code className="bg-neutral-100 px-1.5 py-0.5">pnpm run generate-exports</code> to
            regenerate downloadable data exports.
          </p>
        </section>

        <section className="border border-neutral-200 p-5">
          <h2 className="font-medium text-neutral-900 mb-2">Site Stats</h2>
          <p className="text-sm text-neutral-500">
            Dashboard, data integrity, and deployment status will be available
            here in a future update.
          </p>
        </section>
      </div>
    </div>
  );
}
