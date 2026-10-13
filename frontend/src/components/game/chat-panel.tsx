"use client";

import { Info, MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/components/socket-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS, type ChatMessage } from "@/lib/game-types";
import { cn } from "@/lib/utils";

export function ChatPanel({ className, placeholder = "Tulis pesan…" }: { className?: string; placeholder?: string }) {
  const { chat, emit, room } = useSocket();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const myId = room?.me?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  return (
    <section className={cn("flex min-h-64 flex-col rounded-2xl border border-white/10 bg-card/80 p-3", className)}>
      <h2 className="mb-1 flex items-center gap-1.5 font-display font-bold">
        <MessageCircle className="size-4 text-primary" />
        Chat & Clue
      </h2>
      <div ref={listRef} className="max-h-64 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 lg:max-h-none">
        {chat.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Belum ada pesan.</p>}
        {chat.map((m) => (
          <ChatLine key={m.id} message={m} mine={m.player_id === myId} />
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          emit("chat:send_message", { text });
          setText("");
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.CHAT_MAX_LENGTH}
          placeholder={placeholder}
          aria-label="Pesan chat"
          className="h-10 rounded-full px-4"
        />
        <Button type="submit" size="icon-lg" className="size-10 rounded-full" aria-label="Kirim pesan" disabled={!text.trim()}>
          <Send />
        </Button>
      </form>
    </section>
  );
}

function ChatLine({ message: m, mine }: { message: ChatMessage; mine: boolean }) {
  if (m.kind === "round") {
    return (
      <div className="flex items-center gap-2 py-1 font-display text-xs font-bold tracking-wider text-primary uppercase">
        <span className="h-px flex-1 bg-primary/40" />
        {m.text}
        <span className="h-px flex-1 bg-primary/40" />
      </div>
    );
  }
  if (m.kind === "system") {
    return (
      <p className="flex items-start justify-center gap-1 text-center text-xs text-muted-foreground">
        <Info className="mt-px size-3 shrink-0" />
        {m.text}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {!mine && <span className="px-2 text-xs font-bold text-primary">{m.name}</span>}
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words",
          mine ? "rounded-br-sm bg-primary font-semibold text-primary-foreground" : "rounded-bl-sm bg-secondary",
        )}
      >
        {m.text}
      </p>
    </div>
  );
}
