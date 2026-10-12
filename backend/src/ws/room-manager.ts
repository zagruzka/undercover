import type { AuthUser } from "../auth";
import {
  addPlayer,
  createRoom,
  handleTimeout,
  leaveRoom,
  publicView,
  resetToLobby,
  startGame,
  submitDescription,
  submitMrWhiteGuess,
  submitVote,
  updateSettings,
} from "../game/logic";
import { pickRandomWordPair, saveGameHistory } from "../game/repository";
import {
  appendChat,
  deleteRoom,
  getChat,
  getRoom,
  reserveRoomCode,
  saveRoom,
  withRoomLock,
  type ChatMessage,
} from "../game/store";
import { GameError, LIMITS, type Phase, type RoomState } from "../game/types";

/** Abstraksi minimal socket agar manager tidak bergantung langsung pada Elysia. */
export interface ClientSocket {
  id: string;
  send(payload: string): void;
}

interface Connection {
  socket: ClientSocket;
  user: AuthUser;
  room_id: string | null;
}

export type ClientEvent =
  | "room:create"
  | "room:join"
  | "room:leave"
  | "room:update_settings"
  | "game:start"
  | "game:submit_description"
  | "game:submit_vote"
  | "game:mr_white_guess"
  | "game:reset"
  | "chat:send_message"
  | "ping";

export interface ClientMessage {
  event: string;
  data?: Record<string, unknown>;
}

/** Waktu tunggu sebelum pemain yang terputus di lobby dikeluarkan otomatis. */
const LOBBY_DISCONNECT_GRACE_MS = 20_000;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,6}$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class RoomManager {
  private connections = new Map<string, Connection>();
  private roomSockets = new Map<string, Set<string>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  connect(socket: ClientSocket, user: AuthUser): void {
    this.connections.set(socket.id, { socket, user, room_id: null });
    this.send(socket, "connection:ready", { user });
  }

  async disconnect(socketId: string): Promise<void> {
    const conn = this.connections.get(socketId);
    if (!conn) return;
    this.connections.delete(socketId);
    if (conn.room_id) await this.detach(conn, false);
  }

  async handleMessage(socketId: string, message: ClientMessage): Promise<void> {
    const conn = this.connections.get(socketId);
    if (!conn) return;
    const data = message.data ?? {};

    try {
      switch (message.event as ClientEvent) {
        case "ping":
          return this.send(conn.socket, "pong", { server_now: Date.now() });
        case "room:create":
          return await this.createRoom(conn);
        case "room:join":
          return await this.joinRoom(conn, asString(data.room_id).toUpperCase().trim());
        case "room:leave":
          return await this.detach(conn, true);
        case "room:update_settings":
          return await this.mutate(conn, (state) =>
            updateSettings(state, conn.user.id, (data.settings ?? {}) as Record<string, number>),
          );
        case "game:start": {
          const words = await pickRandomWordPair();
          return await this.mutate(conn, (state, now) => startGame(state, conn.user.id, words, now));
        }
        case "game:submit_description":
          return await this.mutate(conn, (state, now) =>
            submitDescription(state, conn.user.id, asString(data.text), now),
          );
        case "game:submit_vote":
          return await this.mutate(conn, (state, now) => {
            submitVote(state, conn.user.id, asString(data.target_id), now);
          });
        case "game:mr_white_guess":
          return await this.mutate(conn, (state, now) => {
            submitMrWhiteGuess(state, conn.user.id, asString(data.guess), now);
          });
        case "game:reset":
          return await this.mutate(conn, (state) => resetToLobby(state, conn.user.id));
        case "chat:send_message":
          return await this.sendChat(conn, asString(data.text));
        default:
          throw new GameError(`Event tidak dikenal: ${message.event}`);
      }
    } catch (err) {
      const isGameError = err instanceof GameError;
      if (!isGameError) console.error(`[ws] ${message.event} gagal:`, err);
      this.send(conn.socket, "error", {
        source_event: message.event,
        message: isGameError ? err.message : "Terjadi kesalahan di server",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Room membership
  // -------------------------------------------------------------------------

  private async createRoom(conn: Connection): Promise<void> {
    if (conn.room_id) await this.detach(conn, true);
    const now = Date.now();
    const roomId = await reserveRoomCode(createRoom("", conn.user, now));
    await withRoomLock(roomId, async () => {
      const state = (await getRoom(roomId))!;
      this.attach(conn, roomId);
      await this.commit(state, "lobby");
    });
    this.send(conn.socket, "room:joined", { room_id: roomId, chat: [] });
  }

  private async joinRoom(conn: Connection, roomId: string): Promise<void> {
    if (!ROOM_CODE_PATTERN.test(roomId)) throw new GameError("Kode room tidak valid");
    if (conn.room_id && conn.room_id !== roomId) await this.detach(conn, true);

    await withRoomLock(roomId, async () => {
      const state = await getRoom(roomId);
      if (!state) throw new GameError("Room tidak ditemukan");
      const prevPhase = state.phase;
      addPlayer(state, conn.user);
      this.clearGrace(roomId, conn.user.id);
      this.attach(conn, roomId);
      await this.commit(state, prevPhase);
    });
    this.send(conn.socket, "room:joined", { room_id: roomId, chat: await getChat(roomId) });
  }

  /**
   * Melepas socket dari room. `explicit` = pemain menekan tombol keluar;
   * jika tidak, berarti koneksi terputus dan pemain diberi waktu untuk kembali.
   */
  private async detach(conn: Connection, explicit: boolean): Promise<void> {
    const roomId = conn.room_id;
    if (!roomId) return;
    conn.room_id = null;
    const sockets = this.roomSockets.get(roomId);
    sockets?.delete(conn.socket.id);
    if (sockets && sockets.size === 0) this.roomSockets.delete(roomId);
    if (explicit) this.send(conn.socket, "room:left", { room_id: roomId });

    // Pemain masih terhubung dari tab/perangkat lain di room yang sama.
    if (!explicit && this.userSocketsInRoom(roomId, conn.user.id).length > 0) return;

    await withRoomLock(roomId, async () => {
      const state = await getRoom(roomId);
      const player = state?.players.find((p) => p.id === conn.user.id);
      if (!state || !player) return;
      const prevPhase = state.phase;

      if (explicit) {
        for (const other of this.userSocketsInRoom(roomId, conn.user.id)) {
          this.detachSilently(other, roomId);
          this.send(other.socket, "room:left", { room_id: roomId });
        }
        const empty = leaveRoom(state, conn.user.id, Date.now());
        if (empty) return this.destroyRoom(roomId);
      } else {
        player.connected = false;
        if (state.phase === "lobby" || state.phase === "ended") this.scheduleGrace(roomId, conn.user.id);
      }
      await this.commit(state, prevPhase);
    });
  }

  private detachSilently(conn: Connection, roomId: string): void {
    conn.room_id = null;
    this.roomSockets.get(roomId)?.delete(conn.socket.id);
  }

  private attach(conn: Connection, roomId: string): void {
    conn.room_id = roomId;
    let sockets = this.roomSockets.get(roomId);
    if (!sockets) this.roomSockets.set(roomId, (sockets = new Set()));
    sockets.add(conn.socket.id);
  }

  private userSocketsInRoom(roomId: string, userId: string): Connection[] {
    const ids = this.roomSockets.get(roomId) ?? new Set<string>();
    return [...ids]
      .map((id) => this.connections.get(id))
      .filter((c): c is Connection => !!c && c.user.id === userId);
  }

  private scheduleGrace(roomId: string, userId: string): void {
    const key = `${roomId}:${userId}`;
    this.clearGrace(roomId, userId);
    this.graceTimers.set(
      key,
      setTimeout(() => {
        this.graceTimers.delete(key);
        withRoomLock(roomId, async () => {
          const state = await getRoom(roomId);
          const player = state?.players.find((p) => p.id === userId);
          if (!state || !player || player.connected) return;
          const prevPhase = state.phase;
          const empty = leaveRoom(state, userId, Date.now());
          if (empty) return this.destroyRoom(roomId);
          await this.commit(state, prevPhase);
        }).catch((err) => console.error("[ws] grace timeout gagal:", err));
      }, LOBBY_DISCONNECT_GRACE_MS),
    );
  }

  private clearGrace(roomId: string, userId: string): void {
    const key = `${roomId}:${userId}`;
    const timer = this.graceTimers.get(key);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(key);
  }

  private async destroyRoom(roomId: string): Promise<void> {
    this.clearTimer(roomId);
    this.roomSockets.delete(roomId);
    await deleteRoom(roomId);
  }

  // -------------------------------------------------------------------------
  // State mutation & broadcast
  // -------------------------------------------------------------------------

  private async mutate(conn: Connection, fn: (state: RoomState, now: number) => void): Promise<void> {
    const roomId = conn.room_id;
    if (!roomId) throw new GameError("Kamu belum bergabung ke room");
    await withRoomLock(roomId, async () => {
      const state = await getRoom(roomId);
      if (!state) throw new GameError("Room sudah tidak ada");
      const prevPhase = state.phase;
      fn(state, Date.now());
      await this.commit(state, prevPhase);
    });
  }

  /** Menyimpan state, mencatat histori jika game baru selesai, broadcast, dan menjadwalkan timer. */
  private async commit(state: RoomState, prevPhase: Phase): Promise<void> {
    await saveRoom(state);
    if (state.phase === "ended" && prevPhase !== "ended") {
      saveGameHistory(state).catch((err) => console.error("[db] gagal menyimpan histori game:", err));
    }
    this.broadcastState(state);
    this.scheduleTimer(state);
  }

  private broadcastState(state: RoomState): void {
    const now = Date.now();
    for (const socketId of this.roomSockets.get(state.room_id) ?? []) {
      const conn = this.connections.get(socketId);
      if (conn) this.send(conn.socket, "room:state", publicView(state, conn.user.id, now));
    }
  }

  private broadcast(roomId: string, event: string, data: unknown): void {
    for (const socketId of this.roomSockets.get(roomId) ?? []) {
      const conn = this.connections.get(socketId);
      if (conn) this.send(conn.socket, event, data);
    }
  }

  private scheduleTimer(state: RoomState): void {
    this.clearTimer(state.room_id);
    if (state.deadline === null) return;
    const roomId = state.room_id;
    const delay = Math.max(0, state.deadline - Date.now()) + 100;
    this.timers.set(
      roomId,
      setTimeout(() => {
        this.timers.delete(roomId);
        withRoomLock(roomId, async () => {
          const current = await getRoom(roomId);
          if (!current) return;
          const prevPhase = current.phase;
          if (handleTimeout(current, Date.now())) await this.commit(current, prevPhase);
          else this.scheduleTimer(current);
        }).catch((err) => console.error("[ws] timer gagal:", err));
      }, delay),
    );
  }

  private clearTimer(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer) clearTimeout(timer);
    this.timers.delete(roomId);
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  private async sendChat(conn: Connection, text: string): Promise<void> {
    const roomId = conn.room_id;
    if (!roomId) throw new GameError("Kamu belum bergabung ke room");
    const clean = text.trim();
    if (!clean) return;
    if (clean.length > LIMITS.CHAT_MAX_LENGTH) {
      throw new GameError(`Pesan maksimal ${LIMITS.CHAT_MAX_LENGTH} karakter`);
    }
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      room_id: roomId,
      player_id: conn.user.id,
      name: conn.user.name,
      text: clean,
      sent_at: Date.now(),
    };
    await appendChat(message);
    this.broadcast(roomId, "chat:message", message);
  }

  private send(socket: ClientSocket, event: string, data: unknown): void {
    socket.send(JSON.stringify({ event, data }));
  }

  /**
   * Dipanggil saat server start: semua koneksi lama sudah putus, jadi pemain
   * ditandai terputus (klien akan join ulang otomatis) dan timer dipulihkan.
   */
  async restoreRooms(roomIds: string[]): Promise<void> {
    for (const roomId of roomIds) {
      await withRoomLock(roomId, async () => {
        const state = await getRoom(roomId);
        if (!state) return;
        for (const p of state.players) {
          p.connected = false;
          if (state.phase === "lobby" || state.phase === "ended") this.scheduleGrace(roomId, p.id);
        }
        await saveRoom(state);
        this.scheduleTimer(state);
      });
    }
  }
}
