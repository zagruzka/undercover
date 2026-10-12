import { redis } from "../redis";
import type { RoomState } from "./types";

const ROOM_TTL_SECONDS = 60 * 60 * 6;
const CHAT_HISTORY_LIMIT = 100;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;

const roomKey = (roomId: string) => `room:${roomId}`;
const chatKey = (roomId: string) => `room:${roomId}:chat`;

export interface ChatMessage {
  id: string;
  room_id: string;
  player_id: string;
  name: string;
  text: string;
  sent_at: number;
}

export async function getRoom(roomId: string): Promise<RoomState | null> {
  const raw = await redis.get(roomKey(roomId));
  return raw ? (JSON.parse(raw) as RoomState) : null;
}

export async function saveRoom(state: RoomState): Promise<void> {
  await redis.set(roomKey(state.room_id), JSON.stringify(state), "EX", ROOM_TTL_SECONDS);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(roomKey(roomId), chatKey(roomId));
}

/** Membuat kode room unik dan langsung mereservasinya di Redis. */
export async function reserveRoomCode(initial: RoomState): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
    const code = Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
    const ok = await redis.set(
      roomKey(code),
      JSON.stringify({ ...initial, room_id: code }),
      "EX",
      ROOM_TTL_SECONDS,
      "NX",
    );
    if (ok === "OK") return code;
  }
  throw new Error("Gagal membuat kode room unik");
}

export async function listRoomIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "room:*", "COUNT", 200);
    cursor = next;
    for (const key of keys) if (!key.endsWith(":chat")) ids.push(key.slice("room:".length));
  } while (cursor !== "0");
  return ids;
}

export async function appendChat(message: ChatMessage): Promise<void> {
  const key = chatKey(message.room_id);
  await redis
    .multi()
    .rpush(key, JSON.stringify(message))
    .ltrim(key, -CHAT_HISTORY_LIMIT, -1)
    .expire(key, ROOM_TTL_SECONDS)
    .exec();
}

export async function getChat(roomId: string): Promise<ChatMessage[]> {
  const items = await redis.lrange(chatKey(roomId), 0, -1);
  return items.map((item) => JSON.parse(item) as ChatMessage);
}

/**
 * Antrian per-room agar operasi baca-ubah-tulis pada state room tidak saling
 * menimpa. Cukup untuk satu instance server; untuk multi-instance gunakan
 * distributed lock (mis. Redlock).
 */
const queues = new Map<string, Promise<unknown>>();

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(roomId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  queues.set(roomId, tail);
  tail.then(() => {
    if (queues.get(roomId) === tail) queues.delete(roomId);
  });
  return run;
}
