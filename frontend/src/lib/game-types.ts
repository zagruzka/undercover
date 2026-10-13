/** Tipe data yang dikirim backend lewat WebSocket (lihat backend/src/game/logic.ts → publicView). */

export type GameRole = "citizen" | "undercover" | "mr_white";
export type Phase = "lobby" | "word_submit" | "card_pick" | "voting" | "mr_white_guess" | "ended";
export type WordMode = "bank" | "custom";

export interface Settings {
  undercover_count: number;
  mr_white_count: number;
  /** Detik; 0 = tanpa batas waktu. */
  vote_duration: number;
  word_mode: WordMode;
}

export interface PublicPlayer {
  id: string;
  name: string;
  image: string | null;
  connected: boolean;
  alive: boolean;
  left: boolean;
  eliminated_round: number | null;
  role: GameRole | null;
}

export interface PublicCard {
  index: number;
  owner_id: string | null;
  role: GameRole | null;
}

export interface Elimination {
  round: number;
  player_id: string | null;
  role: GameRole | null;
  tie: boolean;
}

export interface RoomView {
  room_id: string;
  host_id: string;
  phase: Phase;
  settings: Settings;
  round: number;
  first_clue_player_id: string | null;
  deadline: number | null;
  server_now: number;
  cards: PublicCard[];
  word_submitted_ids: string[];
  votes: Record<string, string>;
  vote_tally: Record<string, number>;
  eliminations: Elimination[];
  mr_white_guesser: string | null;
  mr_white_guess: { player_id: string; guess: string; correct: boolean } | null;
  winner_role: GameRole | null;
  word_a: string | null;
  word_b: string | null;
  category: string | null;
  word_author_id: string | null;
  players: PublicPlayer[];
  me: {
    id: string;
    is_host: boolean;
    card_index: number | null;
    is_mr_white: boolean;
    word: string | null;
    submitted_words: { word_a: string; word_b: string } | null;
  } | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  player_id: string;
  name: string;
  text: string;
  sent_at: number;
}

export const ROLE_LABEL: Record<GameRole, string> = {
  citizen: "Citizen",
  undercover: "Undercover",
  mr_white: "Mr. White",
};

export const ROLE_EMOJI: Record<GameRole, string> = {
  citizen: "🧑‍🤝‍🧑",
  undercover: "🕵️",
  mr_white: "👻",
};

/** Warna latar kartu/label per role. */
export const ROLE_STYLE: Record<GameRole, string> = {
  citizen: "bg-sky-500 text-white",
  undercover: "bg-rose-500 text-white",
  mr_white: "bg-zinc-100 text-zinc-900",
};

export const LIMITS = {
  MIN_PLAYERS: 3,
  WORD_MAX_LENGTH: 32,
  CHAT_MAX_LENGTH: 300,
} as const;

/** Sama dengan validateRoleCounts di backend; dipakai untuk memberi petunjuk di lobby. */
export function roleCountError(settings: Settings, playerCount: number): string | null {
  const { undercover_count: uc, mr_white_count: mw } = settings;
  const citizens = playerCount - uc - mw;
  if (playerCount < LIMITS.MIN_PLAYERS) return `Butuh minimal ${LIMITS.MIN_PLAYERS} pemain`;
  if (uc + mw < 1) return "Minimal 1 Undercover atau Mr. White";
  if (citizens < 2) return "Minimal harus ada 2 Citizen";
  if (uc >= citizens) return "Undercover harus lebih sedikit dari Citizen";
  return null;
}
