import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "./db";
import { users, type User } from "./db/schema";
import { env } from "./env";
import { LIMITS } from "./game/types";

export interface AuthUser {
  id: string;
  name: string;
  image: string | null;
}

const wsSecret = new TextEncoder().encode(env.WS_JWT_SECRET);

/** Memverifikasi token pendek yang diterbitkan frontend (route /api/ws-token). */
export async function verifyWsToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, wsSecret, { algorithms: ["HS256"], audience: "undercover-ws" });
    if (typeof payload.sub !== "string" || typeof payload.name !== "string") return null;
    return {
      id: payload.sub,
      name: payload.name.slice(0, LIMITS.NAME_MAX_LENGTH),
      image: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export function sanitizeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.trim().replace(/\s+/g, " ").slice(0, LIMITS.NAME_MAX_LENGTH);
  return clean.length >= 2 ? clean : null;
}

export interface SyncInput {
  provider: "google" | "guest";
  name: string;
  email?: string | null;
  image?: string | null;
}

/**
 * Dipanggil server NextAuth saat login. Google di-upsert berdasarkan email,
 * guest selalu dibuat sebagai user baru.
 */
export async function syncUser(input: SyncInput): Promise<User> {
  const name = sanitizeName(input.name);
  if (!name) throw new Error("Nama minimal 2 karakter");

  if (input.provider === "google") {
    if (!input.email) throw new Error("Email Google wajib ada");
    const [user] = await db
      .insert(users)
      .values({ name, email: input.email, image: input.image ?? null, is_guest: false })
      .onConflictDoUpdate({ target: users.email, set: { name, image: input.image ?? null } })
      .returning();
    return user!;
  }

  const [user] = await db.insert(users).values({ name, is_guest: true }).returning();
  return user!;
}

export async function findUser(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}
