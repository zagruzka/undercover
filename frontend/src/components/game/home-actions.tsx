"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function HomeActions() {
  const router = useRouter();
  const { status, room, createRoom } = useSocket();
  const [code, setCode] = useState("");
  /** null = tidak sedang membuat room; string = id room yang aktif saat tombol ditekan ("" jika tidak ada). */
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const creating = creatingFrom !== null;

  // Setelah room:create berhasil, backend mengirim state room baru → pindah ke halaman room.
  useEffect(() => {
    if (creatingFrom !== null && room && room.room_id !== creatingFrom) router.push(`/room/${room.room_id}`);
  }, [creatingFrom, room, router]);

  // Jika server gagal membuat room (error ditampilkan lewat toast), aktifkan lagi tombolnya.
  useEffect(() => {
    if (!creating) return;
    const timer = setTimeout(() => setCreatingFrom(null), 8000);
    return () => clearTimeout(timer);
  }, [creating]);

  const validCode = /^[A-Z0-9]{4,6}$/.test(code);

  return (
    <Card>
      <CardContent className="space-y-4">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={status !== "open" || creating}
          onClick={() => {
            setCreatingFrom(room?.room_id ?? "");
            createRoom();
          }}
        >
          {creating ? "Membuat room…" : "Buat Room Baru"}
        </Button>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (validCode) router.push(`/room/${code}`);
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="Kode room"
            aria-label="Kode room"
            autoCapitalize="characters"
            className="h-12 text-center font-mono text-lg tracking-[0.3em] uppercase"
          />
          <Button type="submit" variant="secondary" className="h-12 px-5" disabled={!validCode}>
            Gabung
          </Button>
        </form>

        {status !== "open" && (
          <p className="text-center text-xs text-muted-foreground">
            {status === "connecting" ? "Menghubungkan ke server…" : "Koneksi terputus, mencoba lagi…"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
