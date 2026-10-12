/**
 * Logika permainan Undercover sebagai fungsi murni di atas RoomState.
 * Semua fungsi memutasi `state` yang diberikan; penyimpanan ke Redis dan
 * broadcast WebSocket ditangani oleh lapisan di atasnya.
 */
import {
  DEFAULT_SETTINGS,
  GameError,
  LIMITS,
  type GameRole,
  type Player,
  type RoomState,
  type Settings,
} from "./types";

export type Rng = () => number;

export interface JoiningUser {
  id: string;
  name: string;
  image: string | null;
}

export interface WordPair {
  word_a: string;
  word_b: string;
  category: string;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function findPlayer(state: RoomState, playerId: string): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Pemain tidak ditemukan di room ini");
  return player;
}

function alivePlayers(state: RoomState): Player[] {
  return state.players.filter((p) => p.alive);
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export function createRoom(roomId: string, host: JoiningUser, now: number): RoomState {
  const state: RoomState = {
    room_id: roomId,
    host_id: host.id,
    phase: "lobby",
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    round: 0,
    turn_order: [],
    current_turn_index: 0,
    deadline: null,
    word_a: null,
    word_b: null,
    category: null,
    votes: {},
    descriptions: [],
    eliminations: [],
    mr_white_guesser: null,
    mr_white_guess: null,
    winner_role: null,
    started_at: null,
    ended_at: null,
    created_at: now,
  };
  addPlayer(state, host);
  return state;
}

export function addPlayer(state: RoomState, user: JoiningUser): void {
  const existing = state.players.find((p) => p.id === user.id);
  if (existing) {
    if (existing.left) throw new GameError("Kamu sudah keluar dari game ini, tunggu game selesai");
    existing.connected = true;
    existing.name = user.name;
    existing.image = user.image;
    return;
  }
  if (state.phase !== "lobby" && state.phase !== "ended") {
    throw new GameError("Game sedang berlangsung, tunggu sampai selesai");
  }
  if (state.players.length >= LIMITS.MAX_PLAYERS) {
    throw new GameError(`Room penuh (maksimal ${LIMITS.MAX_PLAYERS} pemain)`);
  }
  state.players.push({
    id: user.id,
    name: user.name,
    image: user.image,
    connected: true,
    alive: true,
    role: null,
    eliminated_round: null,
    left: false,
  });
}

/** Mengeluarkan pemain dari room di luar permainan (lobby / ended). */
function removeFromRoom(state: RoomState, playerId: string): void {
  state.players = state.players.filter((p) => p.id !== playerId);
  if (state.host_id === playerId && state.players.length > 0) {
    state.host_id = (state.players.find((p) => p.connected) ?? state.players[0]!).id;
  }
}

/**
 * Pemain keluar dari room. Saat game berjalan, pemain dianggap tereliminasi.
 * Mengembalikan `true` jika room menjadi kosong dan sebaiknya dihapus.
 */
export function leaveRoom(state: RoomState, playerId: string, now: number): boolean {
  const player = findPlayer(state, playerId);

  if (state.phase === "lobby" || state.phase === "ended") {
    removeFromRoom(state, playerId);
    return state.players.length === 0;
  }

  player.connected = false;
  if (state.host_id === playerId) {
    const next = state.players.find((p) => p.id !== playerId && p.connected && !p.left);
    if (next) state.host_id = next.id;
  }
  if (player.left) return !state.players.some((p) => p.connected);

  player.left = true;
  if (player.alive) {
    player.alive = false;
    player.eliminated_round = state.round;
    removeVotesInvolving(state, playerId);

    if (state.phase === "mr_white_guess") {
      if (state.mr_white_guesser === playerId) resolveMrWhiteGuess(state, playerId, "", now);
    } else {
      const winner = checkWinner(state);
      if (winner) {
        endGame(state, winner, now);
      } else if (state.phase === "description") {
        if (state.turn_order[state.current_turn_index] === playerId) {
          state.current_turn_index--;
          advanceTurn(state, now);
        }
      } else if (state.phase === "voting" && allVoted(state)) {
        resolveVotes(state, now);
      }
    }
  }

  return !state.players.some((p) => p.connected);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function updateSettings(state: RoomState, playerId: string, input: Partial<Settings>): void {
  if (state.host_id !== playerId) throw new GameError("Hanya host yang bisa mengubah pengaturan");
  if (state.phase !== "lobby" && state.phase !== "ended") {
    throw new GameError("Pengaturan hanya bisa diubah sebelum game dimulai");
  }
  const s = state.settings;
  state.settings = {
    undercover_count: clampInt(input.undercover_count ?? s.undercover_count, 0, LIMITS.MAX_PLAYERS, s.undercover_count),
    mr_white_count: clampInt(input.mr_white_count ?? s.mr_white_count, 0, LIMITS.MAX_PLAYERS, s.mr_white_count),
    turn_duration: clampInt(input.turn_duration ?? s.turn_duration, LIMITS.MIN_DURATION, LIMITS.MAX_DURATION, s.turn_duration),
    vote_duration: clampInt(input.vote_duration ?? s.vote_duration, LIMITS.MIN_DURATION, LIMITS.MAX_DURATION, s.vote_duration),
  };
}

/** Melempar GameError jika komposisi role tidak valid untuk jumlah pemain. */
export function validateRoleCounts(settings: Settings, playerCount: number): void {
  const { undercover_count: uc, mr_white_count: mw } = settings;
  const citizens = playerCount - uc - mw;
  if (playerCount < LIMITS.MIN_PLAYERS) {
    throw new GameError(`Minimal ${LIMITS.MIN_PLAYERS} pemain untuk memulai game`);
  }
  if (uc + mw < 1) throw new GameError("Minimal harus ada 1 Undercover atau Mr. White");
  if (citizens < 2) throw new GameError("Minimal harus ada 2 Citizen");
  if (uc >= citizens) throw new GameError("Jumlah Undercover harus lebih sedikit dari Citizen");
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

export function startGame(state: RoomState, playerId: string, words: WordPair, now: number, rng: Rng = Math.random): void {
  if (state.host_id !== playerId) throw new GameError("Hanya host yang bisa memulai game");
  if (state.phase !== "lobby" && state.phase !== "ended") throw new GameError("Game sudah berjalan");

  // Pemain yang keluar / terputus di game sebelumnya tidak ikut.
  state.players = state.players.filter((p) => p.connected && !p.left);
  validateRoleCounts(state.settings, state.players.length);

  const { undercover_count: uc, mr_white_count: mw } = state.settings;
  const roles: GameRole[] = [
    ...Array<GameRole>(uc).fill("undercover"),
    ...Array<GameRole>(mw).fill("mr_white"),
    ...Array<GameRole>(state.players.length - uc - mw).fill("citizen"),
  ];
  const shuffled = shuffle(roles, rng);
  state.players.forEach((p, i) => {
    p.role = shuffled[i]!;
    p.alive = true;
    p.eliminated_round = null;
    p.left = false;
  });

  state.word_a = words.word_a;
  state.word_b = words.word_b;
  state.category = words.category;
  state.descriptions = [];
  state.eliminations = [];
  state.mr_white_guesser = null;
  state.mr_white_guess = null;
  state.winner_role = null;
  state.started_at = now;
  state.ended_at = null;
  state.round = 0;
  startRound(state, now, rng);
}

function startRound(state: RoomState, now: number, rng: Rng = Math.random): void {
  state.round++;
  state.phase = "description";
  state.votes = {};
  state.mr_white_guesser = null;

  const order = shuffle(alivePlayers(state), rng);
  // Mr. White tidak boleh mendapat giliran pertama selama masih ada pemain lain.
  if (order[0]?.role === "mr_white") {
    const swapIdx = order.findIndex((p) => p.role !== "mr_white");
    if (swapIdx > 0) [order[0], order[swapIdx]] = [order[swapIdx]!, order[0]!];
  }
  state.turn_order = order.map((p) => p.id);
  state.current_turn_index = 0;
  state.deadline = now + state.settings.turn_duration * 1000;
}

function advanceTurn(state: RoomState, now: number): void {
  let idx = state.current_turn_index + 1;
  while (idx < state.turn_order.length && !findPlayer(state, state.turn_order[idx]!).alive) idx++;
  state.current_turn_index = idx;

  if (idx >= state.turn_order.length) {
    state.phase = "voting";
    state.votes = {};
    state.deadline = now + state.settings.vote_duration * 1000;
  } else {
    state.deadline = now + state.settings.turn_duration * 1000;
  }
}

export function currentTurnPlayerId(state: RoomState): string | null {
  if (state.phase !== "description") return null;
  return state.turn_order[state.current_turn_index] ?? null;
}

export function submitDescription(state: RoomState, playerId: string, text: string, now: number): void {
  if (state.phase !== "description") throw new GameError("Sekarang bukan fase deskripsi");
  if (currentTurnPlayerId(state) !== playerId) throw new GameError("Belum giliranmu");
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) throw new GameError("Petunjuk tidak boleh kosong");
  if (clean.length > LIMITS.DESCRIPTION_MAX_LENGTH) {
    throw new GameError(`Petunjuk maksimal ${LIMITS.DESCRIPTION_MAX_LENGTH} karakter`);
  }
  if (state.word_a && normalizeWord(clean) === normalizeWord(state.word_a)) {
    throw new GameError("Petunjuk tidak boleh berupa kata rahasia");
  }
  if (state.word_b && normalizeWord(clean) === normalizeWord(state.word_b)) {
    throw new GameError("Petunjuk tidak boleh berupa kata rahasia");
  }
  state.descriptions.push({ player_id: playerId, text: clean, round: state.round, skipped: false });
  advanceTurn(state, now);
}

function removeVotesInvolving(state: RoomState, playerId: string): void {
  delete state.votes[playerId];
  for (const [voter, target] of Object.entries(state.votes)) {
    if (target === playerId) delete state.votes[voter];
  }
}

function allVoted(state: RoomState): boolean {
  return alivePlayers(state).every((p) => state.votes[p.id] !== undefined);
}

/** Mengembalikan `true` jika voting langsung direkap karena semua pemain sudah memilih. */
export function submitVote(state: RoomState, voterId: string, targetId: string, now: number): boolean {
  if (state.phase !== "voting") throw new GameError("Sekarang bukan fase voting");
  const voter = findPlayer(state, voterId);
  if (!voter.alive) throw new GameError("Pemain yang tereliminasi tidak bisa voting");
  const target = findPlayer(state, targetId);
  if (!target.alive) throw new GameError("Pemain tersebut sudah tereliminasi");
  if (voterId === targetId) throw new GameError("Tidak bisa memilih diri sendiri");

  state.votes[voterId] = targetId;
  if (allVoted(state)) {
    resolveVotes(state, now);
    return true;
  }
  return false;
}

export function tallyVotes(votes: Record<string, string>): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  return tally;
}

export function resolveVotes(state: RoomState, now: number): void {
  if (state.phase !== "voting") return;
  const tally = Object.entries(tallyVotes(state.votes));
  const max = Math.max(0, ...tally.map(([, n]) => n));
  const top = tally.filter(([, n]) => n === max);

  if (max === 0 || top.length !== 1) {
    state.eliminations.push({ round: state.round, player_id: null, role: null, tie: true });
    startRound(state, now);
    return;
  }

  const eliminated = findPlayer(state, top[0]![0]);
  eliminated.alive = false;
  eliminated.eliminated_round = state.round;
  state.eliminations.push({ round: state.round, player_id: eliminated.id, role: eliminated.role, tie: false });

  if (eliminated.role === "mr_white") {
    state.phase = "mr_white_guess";
    state.mr_white_guesser = eliminated.id;
    state.deadline = now + LIMITS.MR_WHITE_GUESS_DURATION * 1000;
    return;
  }
  continueOrEnd(state, now);
}

export function submitMrWhiteGuess(state: RoomState, playerId: string, guess: string, now: number): boolean {
  if (state.phase !== "mr_white_guess") throw new GameError("Sekarang bukan fase tebakan Mr. White");
  if (state.mr_white_guesser !== playerId) throw new GameError("Hanya Mr. White yang tereliminasi yang bisa menebak");
  if (!guess.trim()) throw new GameError("Tebakan tidak boleh kosong");
  return resolveMrWhiteGuess(state, playerId, guess, now);
}

function resolveMrWhiteGuess(state: RoomState, playerId: string, guess: string, now: number): boolean {
  const correct = !!state.word_a && !!guess.trim() && normalizeWord(guess) === normalizeWord(state.word_a);
  state.mr_white_guess = { player_id: playerId, guess: guess.trim(), correct };
  state.mr_white_guesser = null;
  if (correct) {
    endGame(state, "mr_white", now);
  } else {
    continueOrEnd(state, now);
  }
  return correct;
}

function continueOrEnd(state: RoomState, now: number): void {
  const winner = checkWinner(state);
  if (winner) endGame(state, winner, now);
  else startRound(state, now);
}

export function checkWinner(state: RoomState): GameRole | null {
  const alive = alivePlayers(state);
  const count = (role: GameRole) => alive.filter((p) => p.role === role).length;
  const uc = count("undercover");
  const mw = count("mr_white");
  const cit = count("citizen");

  if (uc === 0 && mw === 0) return "citizen";
  if (mw > 0 && alive.length <= 2) return "mr_white";
  if (uc > 0 && uc >= cit) return "undercover";
  if (cit === 0) return "mr_white";
  return null;
}

function endGame(state: RoomState, winner: GameRole, now: number): void {
  state.phase = "ended";
  state.winner_role = winner;
  state.ended_at = now;
  state.deadline = null;
  state.mr_white_guesser = null;
}

/** Kembali ke lobby setelah game selesai (dipanggil host). */
export function resetToLobby(state: RoomState, playerId: string): void {
  if (state.host_id !== playerId) throw new GameError("Hanya host yang bisa kembali ke lobby");
  if (state.phase !== "ended") throw new GameError("Game belum selesai");
  state.players = state.players.filter((p) => p.connected && !p.left);
  for (const p of state.players) {
    p.alive = true;
    p.role = null;
    p.eliminated_round = null;
  }
  state.phase = "lobby";
  state.round = 0;
  state.turn_order = [];
  state.current_turn_index = 0;
  state.deadline = null;
  state.word_a = null;
  state.word_b = null;
  state.category = null;
  state.votes = {};
  state.descriptions = [];
  state.eliminations = [];
  state.mr_white_guess = null;
  state.winner_role = null;
  state.started_at = null;
  state.ended_at = null;
}

/**
 * Menangani deadline yang terlewat (giliran, voting, atau tebakan Mr. White).
 * Mengembalikan `true` jika state berubah.
 */
export function handleTimeout(state: RoomState, now: number): boolean {
  if (state.deadline === null || now < state.deadline) return false;
  switch (state.phase) {
    case "description": {
      const playerId = currentTurnPlayerId(state);
      if (playerId) state.descriptions.push({ player_id: playerId, text: "", round: state.round, skipped: true });
      advanceTurn(state, now);
      return true;
    }
    case "voting":
      resolveVotes(state, now);
      return true;
    case "mr_white_guess":
      if (state.mr_white_guesser) resolveMrWhiteGuess(state, state.mr_white_guesser, "", now);
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

/** State yang aman dikirim ke satu pemain: role & kata pemain lain disembunyikan. */
export function publicView(state: RoomState, viewerId: string, now: number) {
  const ended = state.phase === "ended";
  const me = state.players.find((p) => p.id === viewerId) ?? null;
  const myWord =
    me?.role === "citizen" ? state.word_a : me?.role === "undercover" ? state.word_b : null;

  return {
    room_id: state.room_id,
    host_id: state.host_id,
    phase: state.phase,
    settings: state.settings,
    round: state.round,
    turn_order: state.turn_order,
    current_turn_index: state.current_turn_index,
    current_turn_player_id: currentTurnPlayerId(state),
    deadline: state.deadline,
    server_now: now,
    votes: state.votes,
    vote_tally: tallyVotes(state.votes),
    descriptions: state.descriptions,
    eliminations: state.eliminations,
    mr_white_guesser: state.mr_white_guesser,
    mr_white_guess: state.mr_white_guess,
    winner_role: state.winner_role,
    word_a: ended ? state.word_a : null,
    word_b: ended ? state.word_b : null,
    category: ended ? state.category : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      connected: p.connected,
      alive: p.alive,
      left: p.left,
      eliminated_round: p.eliminated_round,
      // Role hanya terlihat jika tereliminasi, game selesai, atau pemain adalah Mr. White itu sendiri.
      role:
        ended || !p.alive || (p.id === viewerId && p.role === "mr_white") ? p.role : null,
    })),
    me: me
      ? {
          id: me.id,
          is_host: state.host_id === me.id,
          is_mr_white: me.role === "mr_white",
          word: state.phase === "lobby" ? null : myWord,
        }
      : null,
  };
}

export type PublicRoomView = ReturnType<typeof publicView>;
