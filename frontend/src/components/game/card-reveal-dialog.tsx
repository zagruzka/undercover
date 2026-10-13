"use client";

import { CardBack } from "@/components/game/game-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RoomView } from "@/lib/game-types";

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
        className="border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-sm"
      >
        <DialogTitle className="sr-only">Kartu rahasiamu</DialogTitle>
        <DialogDescription className="sr-only">Jangan tunjukkan kartu ini ke pemain lain.</DialogDescription>
        <div className="mx-auto w-72 perspective-[1200px] sm:w-80">
          {/* Sisi depan hanya tampil setelah server mengonfirmasi, termasuk selama animasi tutup. */}
          {!confirmed ? (
            <div className="aspect-[3/4] w-full animate-pulse">
              <CardBack index={shownIndex} />
            </div>
          ) : (
            // key: animasi flip diputar ulang setiap kali modal dibuka untuk kartu ini.
            <div key={`${shownIndex}-${open}`} className="aspect-[3/4] w-full animate-card-flip-in transform-3d">
              <CardFront room={room} />
            </div>
          )}
        </div>
        {confirmed && (
          <Button size="lg" className="mx-auto h-12 w-48 font-display text-lg" onClick={onClose}>
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
      className={
        isMrWhite
          ? "flex size-full flex-col items-center justify-center gap-4 rounded-3xl border-8 border-white bg-zinc-100 p-6 text-center text-zinc-900 shadow-2xl backface-hidden"
          : "flex size-full flex-col items-center justify-center gap-4 rounded-3xl border-8 border-white bg-gradient-to-br from-amber-300 to-orange-400 p-6 text-center text-zinc-900 shadow-2xl backface-hidden"
      }
    >
      {isMrWhite ? (
        <>
          <span className="text-7xl" aria-hidden>
            👻
          </span>
          <p className="font-display text-3xl leading-tight font-bold">Anda adalah Mr. White</p>
          <p className="text-base font-semibold text-zinc-600">
            Kamu tidak dapat kata. Dengarkan clue yang lain dan berbaurlah!
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-semibold uppercase tracking-widest text-zinc-800/70">Kata rahasiamu</p>
          <p className="font-display text-5xl leading-tight font-bold break-words">{room.me?.word}</p>
          <p className="text-base font-semibold text-zinc-800/70">Ssst… jangan sampai ketahuan!</p>
        </>
      )}
    </div>
  );
}
