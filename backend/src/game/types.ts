import type { GameRole } from "../db/schema";

export type { GameRole };

export type Phase = "lobby" | "word_submit" | "card_pick" | "voting" | "mr_white_guess" | "ended";

/** `bank` = kata acak dari tabel word_banks, `custom` = setiap pemain menyumbang sepasang kata. */
export type WordMode = "bank" | "custom";

/** `show` = siapa memilih siapa terlihat & tercatat di chat, `hide` = hanya jumlah pemilih. */
export type VoteVisibility = "show" | "hide";

/** Nilai vote khusus untuk melewati eliminasi. */
export const SKIP_VOTE = "skip";

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
  /** Durasi fase voting dalam detik; 0 = tanpa batas waktu. */
  vote_duration: number;
  word_mode: WordMode;
  vote_visibility: VoteVisibility;
}

/** Satu kartu di meja. Role pemilik ditentukan saat dibagikan, kartu hanya wadah yang dipilih. */
export interface Card {
  index: number;
  owner_id: string | null;
}

export interface WordSubmission {
  word_a: string;
  word_b: string;
}

export interface Elimination {
  round: number;
  player_id: string | null;
  role: GameRole | null;
  /** true jika voting seri sehingga tidak ada yang tereliminasi. */
  tie: boolean;
  /** true jika suara "skip" terbanyak sehingga tidak ada yang tereliminasi. */
  skipped: boolean;
  /** Rekap suara ronde ini: target_id (atau "skip") -> jumlah suara. */
  tally: Record<string, number>;
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
  cards: Card[];
  /** Pemain yang disarankan memberi clue pertama pada ronde ini. */
  first_clue_player_id: string | null;
  /** Epoch ms batas waktu fase saat ini; null = tanpa batas. */
  deadline: number | null;
  word_a: string | null;
  word_b: string | null;
  category: string | null;
  /** Mode kata sendiri: player_id -> pasangan kata yang dikirim. */
  word_submissions: Record<string, WordSubmission>;
  /** Mode kata sendiri: pemain yang pasangan katanya terpilih. */
  word_author_id: string | null;
  /** voter_id -> target_id atau SKIP_VOTE */
  votes: Record<string, string>;
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
  MAX_DURATION: 600,
  CARD_PICK_DURATION: 30,
  MR_WHITE_GUESS_DURATION: 45,
  WORD_MAX_LENGTH: 32,
  CHAT_MAX_LENGTH: 300,
  NAME_MAX_LENGTH: 32,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  undercover_count: 1,
  mr_white_count: 0,
  vote_duration: 0,
  word_mode: "bank",
  vote_visibility: "show",
};

export const WIN_SCORE: Record<GameRole, number> = {
  citizen: 10,
  undercover: 15,
  mr_white: 20,
};

export class GameError extends Error {}
