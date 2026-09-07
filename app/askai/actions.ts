"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ASKAI_COOKIE, askaiToken, passwordMatches } from "@/lib/askai-access";

/** Set the alpha cookie when the shared password matches. No accounts, nothing stored. */
export async function enterAskai(formData: FormData): Promise<void> {
  const candidate = String(formData.get("password") ?? "");
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
