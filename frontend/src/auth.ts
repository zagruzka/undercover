import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: { id: string; is_guest: boolean } & DefaultSession["user"];
  }
  interface User {
    is_guest?: boolean;
  }
}

interface BackendUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  is_guest: boolean;
}

class InvalidGuestName extends CredentialsSignin {
  code = "invalid_name";
}

/** Membuat / memperbarui user di database backend (PostgreSQL via Elysia). */
async function syncUser(input: {
  provider: "google" | "guest";
  name: string;
  email?: string | null;
  image?: string | null;
}): Promise<BackendUser> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/auth/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET!,
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sinkronisasi user gagal (${res.status}): ${await res.text()}`);
  return res.json();
}

export const isGoogleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(isGoogleEnabled ? [Google] : []),
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: { player_name: { label: "Nama pemain", type: "text" } },
      async authorize(credentials) {
        const name = String(credentials?.player_name ?? "").trim();
        if (name.length < 2 || name.length > 32) throw new InvalidGuestName();
        const user = await syncUser({ provider: "guest", name });
        return { id: user.id, name: user.name, image: null, is_guest: true };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        const synced = await syncUser({
          provider: "google",
          name: profile?.name ?? user?.name ?? "Pemain",
          email: profile?.email ?? user?.email,
          image: (profile?.picture as string | undefined) ?? user?.image,
        });
        token.uid = synced.id;
        token.is_guest = false;
        token.name = synced.name;
        token.picture = synced.image;
      } else if (user) {
        token.uid = user.id;
        token.is_guest = user.is_guest ?? true;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.is_guest = Boolean(token.is_guest);
      return session;
    },
  },
});
