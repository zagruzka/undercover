"use client";

import { Repeat, Trophy } from "lucide-react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { ROLE_ICON, ROLE_LABEL, type GameRole, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

const WIN_BG: Record<GameRole, string> = {
  citizen: "from-emerald-400 to-emerald-600 text-white",
  undercover: "from-rose-400 to-red-600 text-white",
  mr_white: "from-zinc-100 to-zinc-400 text-zinc-900",
};

export function GameOver({ room }: { room: RoomView }) {
  const { emit } = useSocket();
  const winner = room.winner_role;
  const me = room.players.find((p) => p.id === room.me?.id);
  const iWon = !!winner && me?.role === winner;
  const author = room.players.find((p) => p.id === room.word_author_id);
  const WinnerIcon = winner ? ROLE_ICON[winner] : Trophy;

  return (
    <div className="space-y-2">
      {winner && (
        <section className={cn("flex animate-pop-in items-center gap-3 rounded-2xl bg-gradient-to-br px-4 py-3", WIN_BG[winner])}>
          <WinnerIcon className="size-10 shrink-0" strokeWidth={2.5} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl leading-tight font-bold">{ROLE_LABEL[winner]} menang!</h2>
            {me?.role && <p className="text-sm font-semibold opacity-90">{iWon ? "Kamu menang" : "Kamu kalah"}</p>}
          </div>
          {iWon && <Trophy className="size-8 shrink-0" />}
        </section>
      )}

      <div className="grid grid-cols-2 gap-2 text-center text-white">
        <div className="rounded-xl bg-emerald-500 px-2 py-1.5">
          <p className="text-[11px] opacity-90">Citizen</p>
          <p className="truncate font-display text-lg font-bold">{room.word_a}</p>
        </div>
        <div className="rounded-xl bg-rose-500 px-2 py-1.5">
          <p className="text-[11px] opacity-90">Undercover</p>
          <p className="truncate font-display text-lg font-bold">{room.word_b}</p>
        </div>
      </div>
      {(author || room.category) && (
        <p className="text-center text-xs text-muted-foreground">{author ? `Kata dari ${author.name}` : room.category}</p>
      )}

      {room.me?.is_host ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => emit("game:reset")}>
            Ke lobby
          </Button>
          <Button onClick={() => emit("game:start")}>
            <Repeat />
            Main lagi
          </Button>
        </div>
      ) : (
        <p className="animate-pulse text-center text-sm">Menunggu host…</p>
      )}
    </div>
  );
}
