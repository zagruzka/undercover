"use client";

import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { ROLE_EMOJI, ROLE_LABEL, type GameRole, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

const WIN_TEXT: Record<GameRole, string> = {
  citizen: "Semua penyamar berhasil ditemukan!",
  undercover: "Undercover berhasil menguasai permainan!",
  mr_white: "Mr. White berhasil mengecoh semua orang!",
};

const WIN_BG: Record<GameRole, string> = {
  citizen: "from-sky-400 to-blue-600",
  undercover: "from-rose-400 to-red-600",
  mr_white: "from-zinc-200 to-zinc-500 text-zinc-900",
};

export function GameOver({ room }: { room: RoomView }) {
  const { emit } = useSocket();
  const winner = room.winner_role;
  const me = room.players.find((p) => p.id === room.me?.id);
  const iWon = !!winner && me?.role === winner;
  const author = room.players.find((p) => p.id === room.word_author_id);

  return (
    <div className="space-y-4">
      {winner && (
        <section className={cn("animate-pop-in rounded-3xl bg-gradient-to-br p-6 text-center text-white shadow-2xl", WIN_BG[winner])}>
          <p className="text-7xl" aria-hidden>
            {iWon ? "🏆" : ROLE_EMOJI[winner]}
          </p>
          <h2 className="mt-2 font-display text-4xl font-bold">{ROLE_LABEL[winner]} Menang!</h2>
          <p className="mt-1 text-lg font-semibold opacity-90">{WIN_TEXT[winner]}</p>
          {me?.role && (
            <p className="mt-3 inline-block rounded-full bg-black/25 px-4 py-1 font-display text-xl font-bold">
              {iWon ? "🎉 Kamu menang!" : "😵 Kamu kalah"}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <WordReveal label="Kata Citizen" word={room.word_a} className="bg-sky-500" />
        <WordReveal label="Kata Undercover" word={room.word_b} className="bg-rose-500" />
      </div>
      {(room.category || author) && (
        <p className="text-center text-base text-muted-foreground">
          {author ? `Kata dari ${author.name} ✍️` : `Kategori: ${room.category}`}
        </p>
      )}

      {room.me?.is_host ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" className="h-14 rounded-2xl font-display text-lg" onClick={() => emit("game:reset")}>
            Ke lobby
          </Button>
          <Button size="lg" className="h-14 rounded-2xl font-display text-lg" onClick={() => emit("game:start")}>
            Main lagi! 🔁
          </Button>
        </div>
      ) : (
        <p className="animate-pulse text-center font-display text-lg">Menunggu host memulai game berikutnya…</p>
      )}
    </div>
  );
}

function WordReveal({ label, word, className }: { label: string; word: string | null; className: string }) {
  return (
    <div className={cn("rounded-2xl p-4 text-center text-white shadow-lg", className)}>
      <p className="text-sm font-semibold opacity-90">{label}</p>
      <p className="font-display text-2xl font-bold break-words">{word}</p>
    </div>
  );
}
