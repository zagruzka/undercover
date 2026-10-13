"use client";

import { Check, Eye, Lock } from "lucide-react";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { ROLE_EMOJI, ROLE_LABEL, ROLE_STYLE, type PublicCard, type PublicPlayer } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export type CardMode = "pick" | "vote" | "view";

interface GameCardProps {
  card: PublicCard;
  owner: PublicPlayer | null;
  mode: CardMode;
  isMine: boolean;
  /** Jumlah suara yang diterima pemilik kartu (fase voting). */
  votes?: number;
  /** Kartu ini adalah pilihan voting pemain sendiri. */
  isMyVote?: boolean;
  /** Tampilkan semua sisi depan (game selesai). */
  revealAll?: boolean;
  onClick?: () => void;
}

/** Sisi belakang kartu yang dipakai di meja dan di modal buka kartu. */
export function CardBack({ index, className }: { index: number; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex size-full flex-col items-center justify-center overflow-hidden rounded-2xl border-4 border-white/20",
        "bg-[repeating-linear-gradient(45deg,oklch(0.5_0.22_300)_0_14px,oklch(0.45_0.2_295)_14px_28px)]",
        className,
      )}
    >
      <div className="absolute inset-2 rounded-xl border-2 border-dashed border-white/30" />
      <span className="font-display text-6xl font-bold text-white drop-shadow-lg">?</span>
      <span className="absolute top-2 left-3 font-display text-sm font-bold text-white/80">#{index + 1}</span>
    </div>
  );
}

export function GameCard({ card, owner, mode, isMine, votes = 0, isMyVote, revealAll, onClick }: GameCardProps) {
  const dead = owner ? !owner.alive : false;
  const faceUp = card.role !== null && (dead || revealAll);
  const takenByOther = !!owner && !isMine;
  const clickable =
    (mode === "pick" && !owner) ||
    (mode === "vote" && !!owner && !dead && !isMine) ||
    (mode !== "vote" && isMine && !dead);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      aria-label={
        owner ? `Kartu ${owner.name}${dead ? " (tereliminasi)" : ""}` : `Kartu nomor ${card.index + 1}, belum diambil`
      }
      className={cn(
        "group relative aspect-[3/4] w-full rounded-2xl text-left transition duration-200 outline-none",
        "focus-visible:ring-4 focus-visible:ring-ring",
        clickable && "cursor-pointer hover:-translate-y-1 active:scale-95",
        mode === "pick" && !owner && "motion-safe:animate-wiggle motion-safe:hover:animate-none",
        isMine && !dead && "ring-4 ring-primary ring-offset-2 ring-offset-background",
        isMyVote && "ring-4 ring-accent ring-offset-2 ring-offset-background",
        mode === "pick" && takenByOther && "opacity-60",
      )}
    >
      {faceUp ? (
        <div
          className={cn(
            "flex size-full flex-col items-center justify-center gap-1 rounded-2xl border-4 border-white/30 p-2 text-center",
            ROLE_STYLE[card.role!],
          )}
        >
          <span className="text-4xl" aria-hidden>
            {ROLE_EMOJI[card.role!]}
          </span>
          <span className="font-display text-lg leading-tight font-bold">{ROLE_LABEL[card.role!]}</span>
        </div>
      ) : (
        <CardBack index={card.index} />
      )}

      {/* Label pemilik di bagian bawah kartu */}
      {owner && (
        <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1.5 rounded-xl bg-black/60 px-1.5 py-1 backdrop-blur-sm">
          <PlayerAvatar name={owner.name} image={owner.image} className="size-6 text-xs" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{isMine ? "Kamu" : owner.name}</span>
          {mode === "pick" && takenByOther && <Lock className="size-4 shrink-0 text-white/80" />}
          {isMine && !dead && mode !== "vote" && <Eye className="size-4 shrink-0 text-primary" />}
        </div>
      )}

      {mode === "pick" && !owner && (
        <span className="absolute inset-x-0 -bottom-3 mx-auto w-fit rounded-full bg-primary px-3 py-0.5 font-display text-sm font-bold text-primary-foreground shadow-lg">
          Ambil!
        </span>
      )}

      {/* Tanda centang sejumlah pemilih */}
      {mode === "vote" && votes > 0 && (
        <div className="absolute inset-x-1 top-1 flex flex-wrap justify-center gap-0.5">
          {Array.from({ length: votes }, (_, i) => (
            <span key={i} className="flex size-7 animate-pop-in items-center justify-center rounded-full bg-emerald-500 shadow-md">
              <Check className="size-5 text-white" strokeWidth={4} />
            </span>
          ))}
        </div>
      )}

      {isMyVote && (
        <span className="absolute -top-3 right-1 rounded-full bg-accent px-2 py-0.5 font-display text-xs font-bold text-accent-foreground shadow">
          Pilihanmu
        </span>
      )}

      {/* Silang besar untuk pemain yang tereliminasi */}
      {dead && (
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full p-3 opacity-80 drop-shadow-lg" aria-hidden>
          <path d="M15 15 L85 85 M85 15 L15 85" stroke="oklch(0.6 0.25 25)" strokeWidth="14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
