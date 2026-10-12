import "server-only";
import { SignJWT } from "jose";
import type { Session } from "next-auth";

const secret = new TextEncoder().encode(process.env.WS_JWT_SECRET);

/** Token pendek untuk autentikasi ke backend Elysia (WebSocket & REST). */
export function signBackendToken(user: Session["user"]): Promise<string> {
  return new SignJWT({ name: user.name ?? "Pemain", picture: user.image ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("undercover-ws")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}
