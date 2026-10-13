"use client";

import { Infinity as InfinityIcon, Timer } from "lucide-react";
import { useState } from "react";
import { CardRevealDialog } from "@/components/game/card-reveal-dialog";
import { GameCard, type CardMode } from "@/components/game/game-card";
import { MrWhiteGuessDialog } from "@/components/game/mr-white-dialog";
import { useSocket } from "@/components/socket-provider";
import { useCountdown } from "@/hooks/use-countdown";
import type { RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

/** Meja permainan: kartu untuk direbut, dibuka, dan dipilih saat voting. */
export function GameTable({ room }: { room: RoomView }) {
  const { emit, clockOffset } = useSocket();
  const remaining = useCountdown(room.deadline, clockOffset);
  const [revealRequest, setRevealRequest] = useState<number | null>(null);

  const myId = room.me?.id;
  const me = room.players.find((p) => p.id === myId);
  const myVote = myId ? room.votes[myId] : undefined;
  const ownerOf = (ownerId: string | null) => room.players.find((p) => p.id === ownerId) ?? null;
  const mode: CardMode =
    room.phase === "card_pick" ? "pick" : room.phase === "voting" && me?.alive ? "vote" : "view";

  const handleCardClick = (index: number, ownerId: string | null) => {
    if (ownerId === myId) return setRevealRequest(index); // intip kartu sendiri
    if (mode === "pick") {
      setRevealRequest(index);
      emit("game:pick_card", { card_index: index });
    } else if (mode === "vote" && ownerId) {
      emit("game:submit_vote", { target_id: ownerId });
    }
  };

  return (
    <>
      <StatusBanner room={room} remaining={remaining} />

      <div
        className={cn(
          "grid gap-x-3 gap-y-5 pt-2 pb-3",
          room.cards.length <= 4 ? "grid-cols-2" : "grid-cols-3",
          room.cards.length > 9 && "sm:grid-cols-4",
        )}
      >
        {room.cards.map((card) => (
          <GameCard
            key={card.index}
            card={card}
            owner={ownerOf(card.owner_id)}
            mode={mode}
            isMine={!!myId && card.owner_id === myId}
            votes={room.vote_tally[card.owner_id ?? ""] ?? 0}
            isMyVote={mode === "vote" && !!card.owner_id && card.owner_id === myVote}
            revealAll={room.phase === "ended"}
            onClick={() => handleCardClick(card.index, card.owner_id)}
          />
        ))}
      </div>

      <CardRevealDialog room={room} requestedIndex={revealRequest} onClose={() => setRevealRequest(null)} />
      <MrWhiteGuessDialog room={room} remaining={remaining} />
    </>
  );
}

function StatusBanner({ room, remaining }: { room: RoomView; remaining: number | null }) {
  const nameOf = (id: string | null) => room.players.find((p) => p.id === id)?.name ?? "?";
  const me = room.players.find((p) => p.id === room.me?.id);
  const alive = room.players.filter((p) => p.alive);
  const picked = room.cards.filter((c) => c.owner_id).length;

  let title: React.ReactNode = null;
  let subtitle: React.ReactNode = null;
  let progress: string | null = null;

  switch (room.phase) {
    case "card_pick":
      title = room.me?.card_index === null ? "Rebut kartumu! 🃏" : "Tunggu yang lain…";
      subtitle =
        room.me?.card_index === null
          ? "Cepat pilih satu kartu sebelum diambil orang lain."
          : "Ketuk kartumu untuk melihat kata lagi.";
      progress = `${picked}/${room.cards.length} kartu diambil`;
      break;
    case "voting":
      title = (
        <>
          🗣️ <span className="text-primary">{room.first_clue_player_id === room.me?.id ? "Kamu" : nameOf(room.first_clue_player_id)}</span>{" "}
          kasih clue duluan!
        </>
      );
      subtitle = me?.alive
        ? "Bergiliran beri clue lewat chat atau langsung, lalu ketuk kartu yang kamu curigai."
        : "Kamu sudah tereliminasi — tonton dan tebak-tebakan dalam hati saja 👀";
      progress = `${Object.keys(room.votes).length}/${alive.length} sudah vote`;
      break;
    case "mr_white_guess":
      title = room.mr_white_guesser === room.me?.id ? "Ketahuan! Tebak katanya!" : `👻 ${nameOf(room.mr_white_guesser)} adalah Mr. White!`;
      subtitle = "Kalau tebakan kata Citizen-nya benar, Mr. White langsung menang.";
      break;
    default:
      return null;
  }

  return (
    <div className="rounded-3xl border-2 border-white/10 bg-card/80 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {room.round > 0 && (
            <p className="font-display text-sm font-semibold tracking-wider text-muted-foreground uppercase">Ronde {room.round}</p>
          )}
          <h2 className="font-display text-2xl leading-tight font-bold">{title}</h2>
        </div>
        <Clock remaining={remaining} unlimited={room.phase === "voting" && room.deadline === null} />
      </div>
      <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
      {progress && <p className="mt-2 font-display text-base font-semibold text-primary">{progress}</p>}
    </div>
  );
}

function Clock({ remaining, unlimited }: { remaining: number | null; unlimited: boolean }) {
  if (unlimited) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1 font-display text-lg font-bold" title="Tanpa batas waktu">
        <InfinityIcon className="size-5" />
      </span>
    );
  }
  if (remaining === null) return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1 font-display text-lg font-bold tabular-nums",
        remaining <= 10 && "animate-pulse bg-destructive text-white",
      )}
    >
      <Timer className="size-5" />
      {remaining}
    </span>
  );
}
