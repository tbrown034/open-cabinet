"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ASKAI_COOKIE, askaiToken, passwordMatches, passwordAttemptAllowed } from "@/lib/askai-access";
import { createHash } from "crypto";

/** Set the alpha cookie when the shared password matches. No accounts, nothing stored. */
export async function enterAskai(formData: FormData): Promise<void> {
  const candidate = String(formData.get("password") ?? "").slice(0, 200);
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const key = createHash("sha256").update(`askai-pw:${ip}`).digest("hex").slice(0, 16);
  if (!passwordAttemptAllowed(key)) {
    redirect("/askai?error=2");
  }
  const token = askaiToken();
  if (!token || !passwordMatches(candidate)) {
    redirect("/askai?error=1");
  }
  const jar = await cookies();
  jar.set(ASKAI_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/askai");
}

export async function leaveAskai(): Promise<void> {
  const jar = await cookies();
  jar.delete(ASKAI_COOKIE);
  redirect("/askai");
}
