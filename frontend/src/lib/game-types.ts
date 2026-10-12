/** Tipe data yang dikirim backend lewat WebSocket (lihat backend/src/game/logic.ts → publicView). */

export type GameRole = "citizen" | "undercover" | "mr_white";
export type Phase = "lobby" | "description" | "voting" | "mr_white_guess" | "ended";

export interface Settings {
  undercover_count: number;
  mr_white_count: number;
  turn_duration: number;
  vote_duration: number;
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

export interface Description {
  player_id: string;
  text: string;
  round: number;
  skipped: boolean;
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
  turn_order: string[];
  current_turn_index: number;
  current_turn_player_id: string | null;
  deadline: number | null;
  server_now: number;
  votes: Record<string, string>;
  vote_tally: Record<string, number>;
  descriptions: Description[];
  eliminations: Elimination[];
  mr_white_guesser: string | null;
  mr_white_guess: { player_id: string; guess: string; correct: boolean } | null;
  winner_role: GameRole | null;
  word_a: string | null;
  word_b: string | null;
  category: string | null;
  players: PublicPlayer[];
  me: { id: string; is_host: boolean; is_mr_white: boolean; word: string | null } | null;
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

export const ROLE_STYLE: Record<GameRole, string> = {
  citizen: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  undercover: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  mr_white: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-200",
};

export const LIMITS = {
  MIN_PLAYERS: 3,
  DESCRIPTION_MAX_LENGTH: 80,
  CHAT_MAX_LENGTH: 300,
} as const;

/** Sama dengan validateRoleCounts di backend; dipakai untuk memberi petunjuk di lobby. */
export function roleCountError(settings: Settings, playerCount: number): string | null {
  const { undercover_count: uc, mr_white_count: mw } = settings;
  const citizens = playerCount - uc - mw;
  if (playerCount < LIMITS.MIN_PLAYERS) return `Minimal ${LIMITS.MIN_PLAYERS} pemain untuk memulai game`;
  if (uc + mw < 1) return "Minimal harus ada 1 Undercover atau Mr. White";
  if (citizens < 2) return "Minimal harus ada 2 Citizen";
  if (uc >= citizens) return "Jumlah Undercover harus lebih sedikit dari Citizen";
  return null;
}
