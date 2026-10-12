"use client";

import { Trophy } from "lucide-react";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABEL, ROLE_STYLE, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

const WIN_TEXT = {
  citizen: "Citizen berhasil menemukan semua penyamar!",
  undercover: "Undercover berhasil menguasai permainan!",
  mr_white: "Mr. White berhasil mengecoh semua orang!",
} as const;

export function GameOver({ room }: { room: RoomView }) {
  const { emit } = useSocket();
  const winner = room.winner_role;
  const me = room.players.find((p) => p.id === room.me?.id);
  const iWon = !!winner && me?.role === winner;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 text-center">
        <div>
          <Trophy className={cn("mx-auto size-10", iWon ? "text-amber-500" : "text-muted-foreground")} />
          <p className="mt-2 text-2xl font-bold">{winner ? `${ROLE_LABEL[winner]} Menang!` : "Game selesai"}</p>
          {winner && <p className="text-sm text-muted-foreground">{WIN_TEXT[winner]}</p>}
          {me?.role && <p className="mt-1 text-sm font-medium">{iWon ? "🎉 Kamu menang!" : "Kamu kalah, coba lagi!"}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className={cn("rounded-lg p-3", ROLE_STYLE.citizen)}>
            <p className="text-xs">Kata Citizen</p>
            <p className="text-lg font-bold">{room.word_a}</p>
          </div>
          <div className={cn("rounded-lg p-3", ROLE_STYLE.undercover)}>
            <p className="text-xs">Kata Undercover</p>
            <p className="text-lg font-bold">{room.word_b}</p>
          </div>
        </div>
        {room.category && <p className="text-xs text-muted-foreground">Kategori: {room.category}</p>}

        <ul className="space-y-1.5 text-left">
          {room.players
            .filter((p) => p.role)
            .map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border p-2">
                <PlayerAvatar name={p.name} image={p.image} />
                <span className="flex-1 truncate text-sm">{p.name}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs", ROLE_STYLE[p.role!])}>{ROLE_LABEL[p.role!]}</span>
                {p.role === winner && <Trophy className="size-4 text-amber-500" aria-label="Menang" />}
              </li>
            ))}
        </ul>

        {room.me?.is_host ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => emit("game:reset")}>
              Ke lobby
            </Button>
            <Button size="lg" onClick={() => emit("game:start")}>
              Main lagi
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Menunggu host memulai game berikutnya…</p>
        )}
      </CardContent>
    </Card>
  );
}
