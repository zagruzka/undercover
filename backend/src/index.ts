import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { syncUser, verifyWsToken, type AuthUser } from "./auth";
import { env } from "./env";
import { getUserStats } from "./game/repository";
import { listRoomIds } from "./game/store";
import { RoomManager, type ClientMessage } from "./ws/room-manager";

const manager = new RoomManager();
/** Verifikasi token berjalan async di `open`; pesan yang datang lebih dulu menunggu promise ini. */
const pendingAuth = new Map<string, Promise<AuthUser | null>>();

function parseMessage(message: unknown): ClientMessage | null {
  let value = message;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || typeof (value as ClientMessage).event !== "string") return null;
  return value as ClientMessage;
}

function bearer(authorization: string | undefined): string | null {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

// Koneksi, timer, dan lock room disimpan in-memory, jadi hanya boleh ada satu
// proses per port. Elysia mengaktifkan reusePort secara default, yang membuat
// proses kedua diam-diam berbagi port dan membagi koneksi pemain.
export const app = new Elysia({ serve: { reusePort: false } })
  .use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }))
  .get("/health", () => ({ ok: true }))
  .post(
    "/api/auth/sync",
    async ({ headers, body, status }) => {
      if (headers["x-internal-secret"] !== env.INTERNAL_API_SECRET) return status(401, { error: "Unauthorized" });
      try {
        const user = await syncUser(body);
        return { id: user.id, name: user.name, email: user.email, image: user.image, is_guest: user.is_guest };
      } catch (err) {
        return status(400, { error: (err as Error).message });
      }
    },
    {
      body: t.Object({
        provider: t.Union([t.Literal("google"), t.Literal("guest")]),
        name: t.String(),
        email: t.Optional(t.Nullable(t.String())),
        image: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .get("/api/me/stats", async ({ headers, status }) => {
    const user = await verifyWsToken(bearer(headers.authorization));
    if (!user) return status(401, { error: "Unauthorized" });
    return getUserStats(user.id);
  })
  .ws("/ws", {
    query: t.Object({ token: t.String() }),
    open(ws) {
      const auth = verifyWsToken(ws.data.query.token);
      pendingAuth.set(ws.id, auth);
      auth.then((user) => {
        if (!user) {
          ws.send(JSON.stringify({ event: "error", data: { message: "Sesi tidak valid, silakan login ulang" } }));
          ws.close(4001, "Unauthorized");
          return;
        }
        manager.connect({ id: ws.id, send: (payload) => ws.send(payload) }, user);
      });
    },
    async message(ws, raw) {
      const user = await pendingAuth.get(ws.id);
      if (!user) return;
      const message = parseMessage(raw);
      if (!message) {
        ws.send(JSON.stringify({ event: "error", data: { message: "Format pesan tidak valid" } }));
        return;
      }
      await manager.handleMessage(ws.id, message);
    },
    async close(ws) {
      await pendingAuth.get(ws.id);
      pendingAuth.delete(ws.id);
      await manager.disconnect(ws.id);
    },
  });

if (import.meta.main) {
  await manager.restoreRooms(await listRoomIds());
  app.listen(env.PORT);
  console.log(`🕵️  Undercover backend berjalan di http://localhost:${env.PORT} (WebSocket: /ws)`);
}
