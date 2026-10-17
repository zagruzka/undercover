"use client";

import { Check, Lock } from "lucide-react";
import { ROLE_ICON, ROLE_LABEL, ROLE_STYLE, type PublicCard, type PublicPlayer } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export type CardMode = "pick" | "vote" | "view";

interface GameCardProps {
  card: PublicCard;
  owner: PublicPlayer | null;
  mode: CardMode;
  isMine: boolean;
  /** Jumlah suara yang diterima pemilik kartu (mode show vote). */
  votes?: number;
  /** Kartu ini adalah pilihan vote pemain sendiri. */
  isMyVote?: boolean;
  /** Pemilik kartu sudah vote (penanda kecil, juga di mode hide). */
  hasVoted?: boolean;
  /** Tampilkan semua sisi depan (game selesai). */
  revealAll?: boolean;
  onClick?: () => void;
}

/** Sisi belakang kartu yang dipakai di meja dan di modal buka kartu. */
export function CardBack({ index, className, large }: { index: number; className?: string; large?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex size-full items-center justify-center overflow-hidden rounded-xl border-2 border-white/20",
        "bg-[repeating-linear-gradient(45deg,oklch(0.5_0.22_300)_0_8px,oklch(0.45_0.2_295)_8px_16px)]",
        className,
      )}
    >
      <div className="absolute inset-1 rounded-lg border border-dashed border-white/30" />
      <span className={cn("font-display font-bold text-white drop-shadow", large ? "text-8xl" : "text-4xl")}>?</span>
      <span className="absolute top-0.5 left-1.5 font-display text-[10px] font-bold text-white/80">{index + 1}</span>
    </div>
  );
}

export function GameCard({ card, owner, mode, isMine, votes = 0, isMyVote, hasVoted, revealAll, onClick }: GameCardProps) {
  const dead = owner ? !owner.alive : false;
  const faceUp = card.role !== null && (dead || revealAll);
  const takenByOther = !!owner && !isMine;
  const clickable = (mode === "pick" && !owner) || (mode === "vote" && !!owner && !dead);
  const RoleIcon = card.role ? ROLE_ICON[card.role] : null;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      aria-label={
        owner ? `Kartu ${owner.name}${dead ? " (tereliminasi)" : ""}` : `Kartu nomor ${card.index + 1}, belum diambil`
      }
      className={cn(
        "relative aspect-3/4 w-full rounded-xl text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
        clickable && "cursor-pointer active:scale-95",
        mode === "pick" && !owner && "motion-safe:animate-wiggle",
        isMine && !dead && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isMyVote && "ring-3 ring-accent ring-offset-2 ring-offset-background",
        mode === "pick" && takenByOther && "opacity-50",
      )}
    >
      {faceUp && RoleIcon ? (
        <div
          className={cn(
            "flex size-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-white/30 pb-4",
            ROLE_STYLE[card.role!],
          )}
        >
          <RoleIcon className="size-8" strokeWidth={2.5} />
          <span className="font-display text-xs leading-tight font-bold">{ROLE_LABEL[card.role!]}</span>
        </div>
      ) : (
        <CardBack index={card.index} />
      )}

      {owner && (
        <div className="absolute inset-x-2 bottom-0.5 flex items-center gap-0.5 rounded-lg bg-black/65 px-1 py-0.5">
          <span className={`min-w-0 flex-1 truncate text-xs leading-tight font-bold ${isMine ? "text-yellow-500" : "text-white"}`}>
            {isMine ? "Kamu" : owner.name}
          </span>
          {mode === "pick" && takenByOther && <Lock className="size-3 shrink-0 text-white/80" />}
          {hasVoted && <Check className="size-3 shrink-0 text-emerald-400" strokeWidth={3} aria-label="Sudah vote" />}
        </div>
      )}

      {/* Tanda centang sejumlah pemilih (mode show vote) */}
      {votes > 0 && (
        <div className="absolute inset-x-0.5 top-0.5 flex flex-wrap justify-center gap-px">
          {Array.from({ length: votes }, (_, i) => (
            <span key={i} className="flex size-4 animate-pop-in items-center justify-center rounded-full bg-emerald-500 shadow ring-1 ring-white">
              <Check className="size-3 text-white" strokeWidth={4} />
            </span>
          ))}
        </div>
      )}

      {/* Silang besar untuk pemain yang tereliminasi */}
      {dead && (
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full p-2 opacity-80" aria-hidden>
          <path d="M15 15 L85 85 M85 15 L15 85" stroke="oklch(0.6 0.25 25)" strokeWidth="14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
