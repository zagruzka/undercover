"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ChatMessage, RoomView } from "@/lib/game-types";

type Status = "connecting" | "open" | "closed";

interface SocketContextValue {
  status: Status;
  room: RoomView | null;
  chat: ChatMessage[];
  /** Selisih jam server - jam lokal (ms), untuk countdown yang akurat. */
  clockOffset: number;
  /** Error terakhir saat join room (mis. room tidak ditemukan). */
  joinError: string | null;
  emit: (event: string, data?: Record<string, unknown>) => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const PING_INTERVAL_MS = 25_000;


export function SocketProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [joinError, setJoinError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  /** Room yang ingin diikuti; dipakai untuk join ulang otomatis setelah reconnect. */
  const desiredRoomRef = useRef<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const readyRef = useRef(false);

  const sendRaw = useCallback((payload: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && readyRef.current) ws.send(payload);
    else queueRef.current.push(payload);
  }, []);

  const emit = useCallback(
    (event: string, data: Record<string, unknown> = {}) => sendRaw(JSON.stringify({ event, data })),
    [sendRaw],
  );

  useEffect(() => {
    const redirectToLogin = () =>
      router.replace(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    let cancelled = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    async function connect() {
      setStatus("connecting");
      let token: string;
      try {
        const res = await fetch("/api/ws-token", { cache: "no-store" });
        if (res.status === 401) return redirectToLogin();
        token = (await res.json()).token;
      } catch {
        return scheduleReconnect();
      }
      if (cancelled) return;

      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        const { event, data } = JSON.parse(String(e.data));
        switch (event) {
          case "connection:ready": {
            retry = 0;
            readyRef.current = true;
            setStatus("open");
            if (desiredRoomRef.current) ws.send(JSON.stringify({ event: "room:join", data: { room_id: desiredRoomRef.current } }));
            const queued = queueRef.current.splice(0);
            for (const payload of queued) ws.send(payload);
            break;
          }
          case "room:state":
            setClockOffset(data.server_now - Date.now());
            setRoom(data);
            break;
          case "room:joined":
            desiredRoomRef.current = data.room_id;
            setJoinError(null);
            setChat(data.chat ?? []);
            break;
          case "room:left":
            desiredRoomRef.current = null;
            setRoom(null);
            setChat([]);
            break;
          case "chat:message":
            setChat((prev) => [...prev.slice(-99), data]);
            break;
          case "error":
            if (data.source_event === "room:join") {
              desiredRoomRef.current = null;
              setJoinError(data.message);
            } else {
              toast.error(data.message);
            }
            break;
        }
      };

      ws.onclose = (e) => {
        readyRef.current = false;
        clearInterval(pingTimer);
        if (cancelled) return;
        setStatus("closed");
        if (e.code === 4001) return redirectToLogin();
        scheduleReconnect();
      };

      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: "ping" }));
      }, PING_INTERVAL_MS);
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = Math.min(10_000, 500 * 2 ** retry++);
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      wsRef.current?.close();
    };
  }, [router]);

  const value = useMemo<SocketContextValue>(
    () => ({
      status,
      room,
      chat,
      clockOffset,
      joinError,
      emit,
      createRoom: () => {
        setJoinError(null);
        emit("room:create");
      },
      joinRoom: (roomId: string) => {
        const code = roomId.trim().toUpperCase();
        if (desiredRoomRef.current === code && room?.room_id === code) return;
        desiredRoomRef.current = code;
        setJoinError(null);
        emit("room:join", { room_id: code });
      },
      leaveRoom: () => {
        desiredRoomRef.current = null;
        setRoom(null);
        setChat([]);
        emit("room:leave");
      },
    }),
    [status, room, chat, clockOffset, joinError, emit],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket harus dipakai di dalam <SocketProvider>");
  return ctx;
}
