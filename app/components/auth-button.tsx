"use client";

import Link from "next/link";
import { useSession, signIn } from "@/lib/auth-client";

export default function AuthButton() {
  const { data: session, isPending } = useSession();

  if (isPending) return null;

  if (session?.user) {
    const displayName = session.user.name || session.user.email?.split("@")[0] || "Account";
    return (
      <Link
        href="/admin"
        className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors truncate max-w-[120px]"
      >
        {displayName}
      </Link>
    );
  }

  return (
    <button
      onClick={() => signIn.social({ provider: "google", callbackURL: "/admin" })}
      className="text-xs text-neutral-400 hover:text-neutral-900 transition-colors cursor-pointer"
    >
      Sign in
    </button>
  );
}
