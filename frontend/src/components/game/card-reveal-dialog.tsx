"use client";

import { Ghost } from "lucide-react";
import { CardBack } from "@/components/game/game-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RoomView } from "@/lib/game-types";
import { cn } from "@/lib/utils";

/**
 * Modal yang membesar dan membalik kartu milik pemain. Selama server belum
 * mengonfirmasi pengambilan kartu, yang terlihat hanya sisi belakang.
 */
export function CardRevealDialog({
  room,
  requestedIndex,
  onClose,
}: {
  room: RoomView;
  requestedIndex: number | null;
  onClose: () => void;
}) {
  const myIndex = room.me?.card_index ?? null;
  const confirmed = myIndex !== null;
  const waiting = !confirmed && requestedIndex !== null && room.cards[requestedIndex]?.owner_id === null;
  // Jika kartu yang diminta keburu diambil orang lain, modal tertutup sendiri (error ditampilkan lewat toast).
  const open = requestedIndex !== null && (confirmed || waiting);
  const shownIndex = myIndex ?? requestedIndex ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-xs"
      >
        <DialogTitle className="sr-only">Kartu rahasiamu</DialogTitle>
        <DialogDescription className="sr-only">Jangan tunjukkan kartu ini ke pemain lain.</DialogDescription>
        <div className="mx-auto w-56 perspective-[1200px]">
          {/* Sisi depan hanya tampil setelah server mengonfirmasi, termasuk selama animasi tutup. */}
          {!confirmed ? (
            <div className="aspect-[3/4] w-full animate-pulse">
              <CardBack index={shownIndex} large className="rounded-3xl" />
            </div>
          ) : (
            // key: animasi flip diputar ulang setiap kali modal dibuka untuk kartu ini.
            <div key={`${shownIndex}-${open}`} className="aspect-[3/4] w-full animate-card-flip-in transform-3d">
              <CardFront room={room} />
            </div>
          )}
        </div>
        {confirmed && (
          <Button size="lg" className="mx-auto w-40 font-display" onClick={onClose}>
            Oke, aku ingat!
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CardFront({ room }: { room: RoomView }) {
  const isMrWhite = room.me?.is_mr_white;
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 rounded-3xl border-6 border-white p-5 text-center text-zinc-900 shadow-2xl backface-hidden",
        isMrWhite ? "bg-zinc-100" : "bg-gradient-to-br from-amber-300 to-orange-400",
      )}
    >
      {isMrWhite ? (
        <>
          <Ghost className="size-16" strokeWidth={2} />
          <p className="font-display text-2xl leading-tight font-bold">Anda adalah Mr. White</p>
          <p className="text-sm font-semibold text-zinc-600">Tanpa kata. Dengarkan & berbaur!</p>
        </>
      ) : (
        <>
          <p className="font-display text-sm font-semibold tracking-widest text-zinc-800/70 uppercase">Kata rahasiamu</p>
          <p className="font-display text-4xl leading-tight font-bold break-words">{room.me?.word}</p>
        </>
      )}
    </div>
  );
}
