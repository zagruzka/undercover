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

host.emit("room:update_settings", { settings: { undercover_count: 1, mr_white_count: 0, word_mode: "custom" } });
await host.waitState((s) => s.settings.word_mode === "custom");
host.emit("game:start");
await Promise.all(clients.map((c) => c.waitState((s) => s.phase === "word_submit")));
const pairs = [["Apel", "Pir"], ["Laut", "Danau"], ["Pena", "Pensil"]];
clients.forEach((c, i) => c.emit("game:submit_words", { word_a: pairs[i]![0], word_b: pairs[i]![1] }));
await Promise.all(clients.map((c) => c.waitState((s) => s.phase === "card_pick")));
console.log("Semua kata terkumpul, fase:", host.state.phase);

host.emit("chat:send_message", { text: "Halo semua!" });
await Promise.all(clients.map((c) => c.waitFor((m) => m.event === "chat:message")));
console.log("Chat diterima semua pemain");

// Race condition: dua pemain menekan kartu 0 di saat yang sama.
const [a, b] = [host, others[0]];
a.emit("game:pick_card", { card_index: 0 });
b.emit("game:pick_card", { card_index: 0 });
const settled = await host.waitState((s) => s.cards[0].owner_id !== null);
const winnerId = settled.cards[0].owner_id;
const loser = winnerId === a.id ? b : a;
const rejection = await loser.waitFor((m) => m.event === "error" && m.data.source_event === "game:pick_card");
if (![a.id, b.id].includes(winnerId)) throw new Error("Pemilik kartu 0 tidak valid");
console.log(`Rebutan kartu 0: dimenangkan ${winnerId === a.id ? a.name : b.name}; yang kalah ditolak: "${rejection.data.message}"`);

loser.emit("game:pick_card", { card_index: 1 });
others[1].emit("game:pick_card", { card_index: 2 });
await Promise.all(clients.map((c) => c.waitState((s) => s.phase === "voting")));
for (const c of clients) console.log(`  ${c.name} kartu #${c.state.me.card_index}: ${c.state.me.word}`);
if (host.state.deadline !== null) throw new Error("Voting default seharusnya tanpa batas waktu");
const firstClue = clients.find((c) => c.id === host.state.first_clue_player_id)!;
console.log(`Clue pertama: ${firstClue.name}, voting tanpa batas waktu ✓`);

const target = host.state.players[0].id;
for (const c of clients) {
  const vote = c.id === target ? clients.find((o) => o.id !== target)!.id : target;
  c.emit("game:submit_vote", { target_id: vote });
}
const after = await host.waitState((s) => s.phase !== "voting");
const elim = after.eliminations.at(-1);
const name = clients.find((c) => c.id === elim.player_id)?.name;
console.log(`Tereliminasi: ${name} (${elim.role}), fase sekarang: ${after.phase}, pemenang: ${after.winner_role}`);
// Dengan 3 pemain, satu eliminasi selalu mengakhiri game.
if (after.phase !== "ended") throw new Error("Game seharusnya sudah berakhir");
const author = clients.find((c) => c.id === after.word_author_id)?.name;
console.log(`Kata: ${after.word_a} vs ${after.word_b} (dari ${author})`);

host.emit("game:reset");
await host.waitState((s) => s.phase === "lobby");
console.log("Kembali ke lobby ✓");

for (const c of clients) c.emit("room:leave");
await new Promise((r) => setTimeout(r, 300));
for (const c of clients) c.ws.close();
console.log("SMOKE TEST OK");
