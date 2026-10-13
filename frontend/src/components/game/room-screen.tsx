"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/game/chat-panel";
import { GameOver } from "@/components/game/game-over";
import { GameTable } from "@/components/game/game-table";
import { Lobby } from "@/components/game/lobby";
import { WordSubmit } from "@/components/game/word-submit";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABEL, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export function RoomScreen({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { status, room, joinRoom, leaveRoom, joinError } = useSocket();

  useEffect(() => {
    joinRoom(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useGameAnnouncements(room?.room_id === roomId ? room : null);

  if (joinError) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="space-y-4">
            <p className="text-6xl" aria-hidden>
              🚪
            </p>
            <p className="font-display text-2xl font-bold">{joinError}</p>
            <Button asChild size="lg" className="h-14 w-full font-display text-lg">
              <Link href="/">Kembali ke beranda</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!room || room.room_id !== roomId || !room.me) {
    return (
      <main className="flex flex-1 items-center justify-center p-4 font-display text-xl text-muted-foreground">
        {status === "open" ? "Bergabung ke room…" : "Menghubungkan ke server…"}
      </main>
    );
  }

  const handleLeave = () => {
    const inGame = room.phase !== "lobby" && room.phase !== "ended";
    const alive = room.players.find((p) => p.id === room.me?.id)?.alive;
    if (inGame && alive && !window.confirm("Keluar saat game berjalan berarti kamu tereliminasi. Lanjutkan?")) return;
    leaveRoom();
    router.push("/");
  };

  const onTable = room.phase === "card_pick" || room.phase === "voting" || room.phase === "mr_white_guess";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b-2 border-white/10 bg-background/85 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <span
            className={cn("size-3 rounded-full", status === "open" ? "bg-emerald-400" : "animate-pulse bg-amber-400")}
            title={status === "open" ? "Terhubung" : "Menghubungkan ulang…"}
          />
          <span className="font-display text-2xl font-bold tracking-widest">{room.room_id}</span>
        </div>
        <Button variant="ghost" onClick={handleLeave} className="text-base">
          Keluar
        </Button>
      </header>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <main className="min-w-0 space-y-4">
          {room.phase === "lobby" && <Lobby room={room} />}
          {room.phase === "word_submit" && <WordSubmit room={room} />}
          {room.phase === "ended" && <GameOver room={room} />}
          {(onTable || room.phase === "ended") && <GameTable room={room} />}
        </main>
        <ChatPanel
          className="lg:sticky lg:top-16 lg:h-[calc(100dvh-5rem)]"
          placeholder={room.phase === "voting" ? "Tulis clue-mu di sini…" : "Ngobrol dulu…"}
        />
      </div>
    </div>
  );
}

/** Menampilkan toast saat ada pemain tereliminasi atau Mr. White selesai menebak. */
function useGameAnnouncements(room: RoomView | null) {
  const seen = useRef<{ room: string | null; eliminations: number; guess: string | null }>({
    room: null,
    eliminations: 0,
    guess: null,
  });

  useEffect(() => {
    if (!room) return;
    const guessKey = room.mr_white_guess ? `${room.round}:${room.mr_white_guess.player_id}` : null;
    // Saat pertama kali masuk room, jangan umumkan ulang kejadian lama.
    if (seen.current.room !== room.room_id) {
      seen.current = { room: room.room_id, eliminations: room.eliminations.length, guess: guessKey };
      return;
    }
    if (room.eliminations.length < seen.current.eliminations) seen.current.eliminations = 0;

    const nameOf = (id: string | null) => room.players.find((p) => p.id === id)?.name ?? "Seseorang";
    for (const e of room.eliminations.slice(seen.current.eliminations)) {
      if (e.tie) toast.info("Voting seri — tidak ada yang tereliminasi.");
      else toast(`${nameOf(e.player_id)} tereliminasi`, { description: e.role ? `Dia adalah ${ROLE_LABEL[e.role]}` : undefined });
    }
    seen.current.eliminations = room.eliminations.length;

    if (guessKey && guessKey !== seen.current.guess && room.mr_white_guess) {
      const g = room.mr_white_guess;
      const who = nameOf(g.player_id);
      if (g.correct) toast.success(`${who} menebak "${g.guess}" dengan benar!`);
      else toast.error(g.guess ? `${who} menebak "${g.guess}" — salah!` : `${who} tidak menebak tepat waktu.`);
    }
    seen.current.guess = guessKey;
  }, [room]);
}
