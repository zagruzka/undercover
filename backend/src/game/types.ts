import type { GameRole } from "../db/schema";

export type { GameRole };

export type Phase = "lobby" | "description" | "voting" | "mr_white_guess" | "ended";

export interface Player {
  id: string;
  name: string;
  image: string | null;
  connected: boolean;
  alive: boolean;
  role: GameRole | null;
  /** Ronde saat pemain tereliminasi (null jika masih hidup). */
  eliminated_round: number | null;
  /** true jika tereliminasi karena keluar dari room. */
  left: boolean;
}

export interface Settings {
  undercover_count: number;
  mr_white_count: number;
  /** Durasi giliran deskripsi per pemain, dalam detik. */
  turn_duration: number;
  /** Durasi fase voting, dalam detik. */
  vote_duration: number;
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
  /** true jika voting seri sehingga tidak ada yang tereliminasi. */
  tie: boolean;
}

export interface MrWhiteGuess {
  player_id: string;
  guess: string;
  correct: boolean;
}

export interface RoomState {
  room_id: string;
  host_id: string;
  phase: Phase;
  settings: Settings;
  players: Player[];
  round: number;
  /** Urutan id pemain yang berbicara pada ronde ini. */
  turn_order: string[];
  current_turn_index: number;
  /** Epoch ms batas waktu giliran / voting / tebakan saat ini. */
  deadline: number | null;
  word_a: string | null;
  word_b: string | null;
  category: string | null;
  /** voter_id -> target_id */
  votes: Record<string, string>;
  descriptions: Description[];
  eliminations: Elimination[];
  mr_white_guesser: string | null;
  mr_white_guess: MrWhiteGuess | null;
  winner_role: GameRole | null;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
}

export const LIMITS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 20,
  MIN_DURATION: 10,
  MAX_DURATION: 300,
  MR_WHITE_GUESS_DURATION: 45,
  DESCRIPTION_MAX_LENGTH: 80,
  CHAT_MAX_LENGTH: 300,
  NAME_MAX_LENGTH: 32,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  undercover_count: 1,
  mr_white_count: 0,
  turn_duration: 45,
  vote_duration: 60,
};

export const WIN_SCORE: Record<GameRole, number> = {
  citizen: 10,
  undercover: 15,
  mr_white: 20,
};

export class GameError extends Error {}
