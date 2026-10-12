import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";

export async function requireUser(callbackUrl: string) {
  // Auth.js memakai crypto sebelum membaca cookie; tandai render ini sebagai
  // request-time agar Cache Components tidak mencoba mem-prerender-nya.
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return session.user;
}
