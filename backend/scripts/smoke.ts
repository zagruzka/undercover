/**
 * Smoke test end-to-end: mensimulasikan 3 pemain memainkan satu game penuh
 * lewat WebSocket. Jalankan saat server hidup: `bun run scripts/smoke.ts`.
 */
import { SignJWT } from "jose";

const API = process.env.API_URL ?? "http://localhost:4000";
const WS = API.replace(/^http/, "ws") + "/ws";
const secret = new TextEncoder().encode(process.env.WS_JWT_SECRET!);

type Msg = { event: string; data: any };

async function createUser(name: string) {
  const res = await fetch(`${API}/api/auth/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET! },
    body: JSON.stringify({ provider: "guest", name }),
  });
  if (!res.ok) throw new Error(`sync gagal: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

class Client {
  ws!: WebSocket;
  state: any = null;
  inbox: Msg[] = [];
  private waiters: Array<{ pred: (m: Msg) => boolean; resolve: (m: Msg) => void }> = [];

  constructor(public name: string, public id: string) {}

  async connect() {
    const token = await new SignJWT({ name: this.name, picture: null })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(this.id)
      .setAudience("undercover-ws")
      .setExpirationTime("5m")
      .sign(secret);
    this.ws = new WebSocket(`${WS}?token=${token}`);
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as Msg;
      if (msg.event === "room:state") this.state = msg.data;
      if (msg.event === "error") console.log(`  [${this.name}] error:`, msg.data.message);
      this.inbox.push(msg);
      this.waiters = this.waiters.filter((w) => (w.pred(msg) ? (w.resolve(msg), false) : true));
    };
    await this.waitFor((m) => m.event === "connection:ready");
  }

  /** Menunggu pesan yang cocok; `fromInbox` juga memeriksa pesan yang sudah diterima. */
  waitFor(pred: (m: Msg) => boolean, timeout = 5000, fromInbox = true): Promise<Msg> {
    const found = fromInbox ? this.inbox.find(pred) : undefined;
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: timeout menunggu pesan`)), timeout);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  }

  waitState(pred: (s: any) => boolean) {
    if (this.state && pred(this.state)) return Promise.resolve(this.state);
    return this.waitFor((m) => m.event === "room:state" && pred(m.data), 5000, false).then((m) => m.data);
  }

  emit(event: string, data: Record<string, unknown> = {}) {
    this.ws.send(JSON.stringify({ event, data }));
  }
}

const users = await Promise.all(["Andi", "Budi", "Citra"].map(createUser));
const clients = users.map((u) => new Client(u.name, u.id));
await Promise.all(clients.map((c) => c.connect()));
const [host, ...others] = clients as [Client, Client, Client];
if (process.env.DEBUG) {
  for (const c of clients) {
    const handler = c.ws.onmessage!.bind(c.ws);
    c.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      console.log(`    <- ${c.name}`, m.event, m.data?.phase ?? "");
      handler(e);
    };
  }
}

host.emit("room:create");
const { data: joined } = await host.waitFor((m) => m.event === "room:joined");
console.log("Room dibuat:", joined.room_id);

for (const c of others) {
  c.emit("room:join", { room_id: joined.room_id });
  await c.waitFor((m) => m.event === "room:joined");
}
await host.waitState((s) => s.players.length === 3);

host.emit("room:update_settings", { settings: { undercover_count: 1, mr_white_count: 0, turn_duration: 20 } });
await host.waitState((s) => s.settings.turn_duration === 20);
host.emit("game:start");
await Promise.all(clients.map((c) => c.waitState((s) => s.phase === "description")));
for (const c of clients) console.log(`  ${c.name} mendapat kata: ${c.state.me.word}`);

host.emit("chat:send_message", { text: "Halo semua!" });
await Promise.all(clients.map((c) => c.waitFor((m) => m.event === "chat:message")));
console.log("Chat diterima semua pemain");

while (host.state.phase === "description") {
  const turnId = host.state.current_turn_player_id;
  const current = clients.find((c) => c.id === turnId)!;
  const before = host.state.current_turn_index;
  current.emit("game:submit_description", { text: `petunjuk dari ${current.name}` });
  await host.waitState((s) => s.current_turn_index !== before || s.phase !== "description");
}
console.log("Semua pemain sudah memberi petunjuk, fase:", host.state.phase);

// Semua memilih pemain pertama di urutan giliran (yang dipilih memilih orang lain).
const target = host.state.turn_order[0];
for (const c of clients) {
  const vote = c.id === target ? clients.find((o) => o.id !== target)!.id : target;
  c.emit("game:submit_vote", { target_id: vote });
}
const after = await host.waitState((s) => s.phase !== "voting");
const elim = after.eliminations.at(-1);
const name = clients.find((c) => c.id === elim.player_id)?.name;
console.log(`Tereliminasi: ${name} (${elim.role}), fase sekarang: ${after.phase}, pemenang: ${after.winner_role}`);

if (after.phase !== "ended") {
  // Ronde 2 dengan 2 pemain: tidak mungkin terjadi karena Undercover menang jika >= Citizen.
  throw new Error("Game seharusnya sudah berakhir");
}
console.log(`Kata: ${after.word_a} vs ${after.word_b}`);

host.emit("game:reset");
await host.waitState((s) => s.phase === "lobby");
console.log("Kembali ke lobby ✓");

for (const c of clients) c.emit("room:leave");
await new Promise((r) => setTimeout(r, 300));
for (const c of clients) c.ws.close();
console.log("SMOKE TEST OK");
