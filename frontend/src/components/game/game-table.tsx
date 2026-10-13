"use client";

import { Eye, Ghost, Hand, Infinity as InfinityIcon, Megaphone, SkipForward, Timer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CardRevealDialog } from "@/components/game/card-reveal-dialog";
import { GameCard, type CardMode } from "@/components/game/game-card";
import { MrWhiteGuessDialog } from "@/components/game/mr-white-dialog";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/use-countdown";
import { SKIP_VOTE, type RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

/** Meja permainan: kartu untuk direbut, dibuka, dan dipilih saat voting. */
export function GameTable({ room }: { room: RoomView }) {
  const { emit, clockOffset } = useSocket();
  const remaining = useCountdown(room.deadline, clockOffset);
  const [revealRequest, setRevealRequest] = useState<number | null>(null);

  const myId = room.me?.id;
  const myCard = room.me?.card_index ?? null;
  const me = room.players.find((p) => p.id === myId);
  const myVote = myId ? room.votes[myId] : undefined;
  const ownerOf = (ownerId: string | null) => room.players.find((p) => p.id === ownerId) ?? null;
  const mode: CardMode = room.phase === "card_pick" ? "pick" : room.phase === "voting" && me?.alive ? "vote" : "view";

  /** Klik kartu yang sama dua kali membatalkan vote (toggle). */
  const toggleVote = (target: string) =>
    myVote === target ? emit("game:cancel_vote") : emit("game:submit_vote", { target_id: target });

  const handleCardClick = (index: number, ownerId: string | null) => {
    if (mode === "pick") {
      if (myCard !== null) return toast.warning("Kamu sudah punya kartu");
      setRevealRequest(index);
      emit("game:pick_card", { card_index: index });
    } else if (mode === "vote" && ownerId) {
      toggleVote(ownerId);
    }
  };

  return (
    <>
      <StatusBanner room={room} remaining={remaining} />

      <div className="grid grid-cols-3 gap-2">
        {room.cards.map((card) => (
          <GameCard
            key={card.index}
            card={card}
            owner={ownerOf(card.owner_id)}
            mode={mode}
            isMine={!!myId && card.owner_id === myId}
            votes={room.vote_tally[card.owner_id ?? ""] ?? 0}
            isMyVote={mode === "vote" && !!card.owner_id && card.owner_id === myVote}
            hasVoted={room.phase === "voting" && !!card.owner_id && room.voted_ids.includes(card.owner_id)}
            revealAll={room.phase === "ended"}
            onClick={() => handleCardClick(card.index, card.owner_id)}
          />
        ))}
      </div>

      {mode === "vote" && (
        <Button
          variant={myVote === SKIP_VOTE ? "default" : "secondary"}
          className="w-full"
          onClick={() => toggleVote(SKIP_VOTE)}
        >
          <SkipForward />
          {myVote === SKIP_VOTE ? "Batal skip" : "Skip vote"}
          {(room.vote_tally[SKIP_VOTE] ?? 0) > 0 && ` · ${room.vote_tally[SKIP_VOTE]}`}
        </Button>
      )}

      {/* Tombol mata: intip kartu sendiri kapan saja */}
      {myCard !== null && room.phase !== "ended" && (
        <Button
          size="icon-lg"
          aria-label="Lihat kartuku"
          className="fixed right-4 bottom-4 z-20 size-14 rounded-full shadow-xl shadow-black/40"
          onClick={() => setRevealRequest(myCard)}
        >
          <Eye className="size-6" />
        </Button>
      )}

      <CardRevealDialog room={room} requestedIndex={revealRequest} onClose={() => setRevealRequest(null)} />
      <MrWhiteGuessDialog room={room} remaining={remaining} />
    </>
  );
}

function StatusBanner({ room, remaining }: { room: RoomView; remaining: number | null }) {
  const nameOf = (id: string | null) => (id === room.me?.id ? "Kamu" : (room.players.find((p) => p.id === id)?.name ?? "?"));
  const me = room.players.find((p) => p.id === room.me?.id);
  const aliveCount = room.players.filter((p) => p.alive).length;
  const picked = room.cards.filter((c) => c.owner_id).length;

  let icon = Hand;
  let title: React.ReactNode;
  let info: string;

  switch (room.phase) {
    case "card_pick":
      title = room.me?.card_index === null ? "Ambil kartumu!" : "Menunggu yang lain";
      info = `${picked}/${room.cards.length} diambil`;
      break;
    case "voting":
      icon = Megaphone;
      title = (
        <>
          <span className="text-primary">{nameOf(room.first_clue_player_id)}</span> clue duluan
        </>
      );
      info = me?.alive ? `${room.voted_ids.length}/${aliveCount} vote` : "Kamu tereliminasi";
      break;
    case "mr_white_guess":
      icon = Ghost;
      title = `${nameOf(room.mr_white_guesser)} = Mr. White!`;
      info = "Sedang menebak";
      break;
    default:
      return null;
  }
  const Icon = icon;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/80 px-3 py-2">
      <Icon className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-tight font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">
          {room.round > 0 && `Ronde ${room.round} · `}
          {info}
        </p>
      </div>
      <Clock remaining={remaining} unlimited={room.phase === "voting" && room.deadline === null} />
    </div>
  );
}

function Clock({ remaining, unlimited }: { remaining: number | null; unlimited: boolean }) {
  if (!unlimited && remaining === null) return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-display font-bold tabular-nums",
        !unlimited && remaining !== null && remaining <= 10 && "animate-pulse bg-destructive text-white",
      )}
      title={unlimited ? "Tanpa batas waktu" : undefined}
    >
      {unlimited ? <InfinityIcon className="size-4" /> : <Timer className="size-4" />}
      {!unlimited && remaining}
    </span>
  );
}
