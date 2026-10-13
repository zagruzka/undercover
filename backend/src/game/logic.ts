/**
 * Logika permainan Undercover sebagai fungsi murni di atas RoomState.
 * Semua fungsi memutasi `state` yang diberikan; penyimpanan ke Redis dan
 * broadcast WebSocket ditangani oleh lapisan di atasnya. Karena setiap
 * perubahan state per-room diproses berurutan (lihat withRoomLock), pengecekan
 * seperti "kartu sudah diambil" di sini aman dari race condition.
 *
 * Alur: lobby → (word_submit) → card_pick → voting ⇄ mr_white_guess → ended
 */
import {
  DEFAULT_SETTINGS,
  GameError,
  LIMITS,
  SKIP_VOTE,
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
  category: string | null;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function pickRandom<T>(items: T[], rng: Rng): T | undefined {
  return items[Math.floor(rng() * items.length)];
}

function findPlayer(state: RoomState, playerId: string): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Pemain tidak ditemukan di room ini");
  return player;
}

function alivePlayers(state: RoomState): Player[] {
  return state.players.filter((p) => p.alive);
}

export function cardIndexOf(state: RoomState, playerId: string): number | null {
  return state.cards.find((c) => c.owner_id === playerId)?.index ?? null;
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function cleanWord(word: unknown): string {
  return typeof word === "string" ? word.trim().replace(/\s+/g, " ") : "";
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
    cards: [],
    first_clue_player_id: null,
    deadline: null,
    word_a: null,
    word_b: null,
    category: null,
    word_submissions: {},
    word_author_id: null,
    votes: {},
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

/** Mengeluarkan pemain sepenuhnya dari daftar (dipakai sebelum kartu dibagikan). */
function removeFromRoom(state: RoomState, playerId: string): void {
  state.players = state.players.filter((p) => p.id !== playerId);
  delete state.word_submissions[playerId];
  if (state.host_id === playerId && state.players.length > 0) {
    state.host_id = (state.players.find((p) => p.connected) ?? state.players[0]!).id;
  }
}

/**
 * Pemain keluar dari room. Setelah kartu dibagikan, pemain dianggap tereliminasi.
 * Mengembalikan `true` jika room menjadi kosong dan sebaiknya dihapus.
 */
export function leaveRoom(state: RoomState, playerId: string, now: number, rng: Rng = Math.random): boolean {
  const player = findPlayer(state, playerId);

  if (state.phase === "lobby" || state.phase === "ended") {
    removeFromRoom(state, playerId);
    return state.players.length === 0;
  }

  if (state.phase === "word_submit") {
    removeFromRoom(state, playerId);
    if (state.players.length === 0) return true;
    try {
      validateRoleCounts(state.settings, state.players.length);
      maybeFinishWordSubmit(state, now, rng);
    } catch {
      // Pemain tidak cukup lagi untuk komposisi role ini: kembali ke lobby.
      backToLobby(state);
    }
    return false;
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
    if (state.phase === "card_pick" && cardIndexOf(state, playerId) === null) {
      assignRandomCard(state, playerId, rng);
    }

    if (state.phase === "mr_white_guess") {
      if (state.mr_white_guesser === playerId) resolveMrWhiteGuess(state, playerId, "", now, rng);
    } else {
      const winner = checkWinner(state);
      if (winner) endGame(state, winner, now);
      else if (state.phase === "card_pick" && allCardsPicked(state)) startRound(state, now, rng);
      else if (state.phase === "voting" && allVoted(state)) resolveVotes(state, now, rng);
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
  const voteInput = Number(input.vote_duration ?? s.vote_duration);
  state.settings = {
    undercover_count: clampInt(input.undercover_count ?? s.undercover_count, 0, LIMITS.MAX_PLAYERS, s.undercover_count),
    mr_white_count: clampInt(input.mr_white_count ?? s.mr_white_count, 0, LIMITS.MAX_PLAYERS, s.mr_white_count),
    vote_duration:
      voteInput === 0 ? 0 : clampInt(voteInput, LIMITS.MIN_DURATION, LIMITS.MAX_DURATION, s.vote_duration),
    word_mode: input.word_mode === "custom" || input.word_mode === "bank" ? input.word_mode : s.word_mode,
    vote_visibility:
      input.vote_visibility === "show" || input.vote_visibility === "hide" ? input.vote_visibility : s.vote_visibility,
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
// Start & kata
// ---------------------------------------------------------------------------

/**
 * Host memulai game. Mode bank langsung membagikan kartu dengan `words`;
 * mode kata sendiri masuk ke fase word_submit dan `words` diabaikan.
 */
export function startGame(
  state: RoomState,
  playerId: string,
  words: WordPair | null,
  now: number,
  rng: Rng = Math.random,
): void {
  if (state.host_id !== playerId) throw new GameError("Hanya host yang bisa memulai game");
  if (state.phase !== "lobby" && state.phase !== "ended") throw new GameError("Game sudah berjalan");

  // Pemain yang keluar / terputus di game sebelumnya tidak ikut.
  state.players = state.players.filter((p) => p.connected && !p.left);
  validateRoleCounts(state.settings, state.players.length);
  resetGameFields(state);
  state.started_at = now;

  if (state.settings.word_mode === "custom") {
    state.phase = "word_submit";
    state.deadline = null;
    return;
  }
  if (!words) throw new Error("Pasangan kata dari bank kata wajib diberikan");
  dealCards(state, words, null, now, rng);
}

export function submitWords(
  state: RoomState,
  playerId: string,
  wordA: unknown,
  wordB: unknown,
  now: number,
  rng: Rng = Math.random,
): void {
  if (state.phase !== "word_submit") throw new GameError("Sekarang bukan waktu mengirim kata");
  findPlayer(state, playerId);
  const a = cleanWord(wordA);
  const b = cleanWord(wordB);
  if (!a || !b) throw new GameError("Kedua kata wajib diisi");
  if (a.length > LIMITS.WORD_MAX_LENGTH || b.length > LIMITS.WORD_MAX_LENGTH) {
    throw new GameError(`Kata maksimal ${LIMITS.WORD_MAX_LENGTH} karakter`);
  }
  if (normalizeWord(a) === normalizeWord(b)) throw new GameError("Kedua kata harus berbeda");

  state.word_submissions[playerId] = { word_a: a, word_b: b };
  maybeFinishWordSubmit(state, now, rng);
}

/** Host memulai dengan kata yang sudah terkumpul tanpa menunggu semua pemain. */
export function forceWordStart(state: RoomState, playerId: string, now: number, rng: Rng = Math.random): void {
  if (state.host_id !== playerId) throw new GameError("Hanya host yang bisa melanjutkan");
  if (state.phase !== "word_submit") throw new GameError("Sekarang bukan waktu mengirim kata");
  if (Object.keys(state.word_submissions).length === 0) throw new GameError("Belum ada pemain yang mengirim kata");
  finishWordSubmit(state, now, rng);
}

function maybeFinishWordSubmit(state: RoomState, now: number, rng: Rng): void {
  if (state.phase !== "word_submit") return;
  if (state.players.every((p) => state.word_submissions[p.id])) finishWordSubmit(state, now, rng);
}

function finishWordSubmit(state: RoomState, now: number, rng: Rng): void {
  const authorId = pickRandom(Object.keys(state.word_submissions), rng)!;
  const pair = state.word_submissions[authorId]!;
  // Acak mana yang menjadi kata Citizen agar penyumbang tidak tahu posisinya.
  const swap = rng() < 0.5;
  dealCards(
    state,
    { word_a: swap ? pair.word_b : pair.word_a, word_b: swap ? pair.word_a : pair.word_b, category: null },
    authorId,
    now,
    rng,
  );
}

/** Membagikan role ke pemain dan menyiapkan kartu tertutup untuk direbut. */
function dealCards(state: RoomState, words: WordPair, authorId: string | null, now: number, rng: Rng): void {
  const { undercover_count: uc, mr_white_count: mw } = state.settings;
  const roles = shuffle(
    [
      ...Array<GameRole>(uc).fill("undercover"),
      ...Array<GameRole>(mw).fill("mr_white"),
      ...Array<GameRole>(state.players.length - uc - mw).fill("citizen"),
    ],
    rng,
  );
  state.players.forEach((p, i) => {
    p.role = roles[i]!;
    p.alive = true;
    p.eliminated_round = null;
    p.left = false;
  });

  // Penyumbang kata sudah tahu kedua kata, jadi tidak boleh menjadi Mr. White.
  const author = authorId ? state.players.find((p) => p.id === authorId) : undefined;
  if (author?.role === "mr_white") {
    const other = pickRandom(state.players.filter((p) => p.role !== "mr_white"), rng)!;
    [author.role, other.role] = [other.role, "mr_white"];
  }

  state.word_a = words.word_a;
  state.word_b = words.word_b;
  state.category = words.category;
  state.word_author_id = authorId;
  state.cards = state.players.map((_, index) => ({ index, owner_id: null }));
  state.phase = "card_pick";
  state.deadline = now + LIMITS.CARD_PICK_DURATION * 1000;
}

// ---------------------------------------------------------------------------
// Kartu
// ---------------------------------------------------------------------------

export function pickCard(state: RoomState, playerId: string, cardIndex: unknown, now: number, rng: Rng = Math.random): void {
  if (state.phase !== "card_pick") throw new GameError("Sekarang bukan waktu memilih kartu");
  const player = findPlayer(state, playerId);
  if (!player.alive) throw new GameError("Kamu sudah keluar dari game ini");
  if (cardIndexOf(state, playerId) !== null) throw new GameError("Kamu sudah memilih kartu");
  const card = state.cards.find((c) => c.index === cardIndex);
  if (!card) throw new GameError("Kartu tidak ditemukan");
  if (card.owner_id) throw new GameError("Kartu sudah diambil pemain lain, pilih kartu lain!");

  card.owner_id = playerId;
  if (allCardsPicked(state)) startRound(state, now, rng);
}

function assignRandomCard(state: RoomState, playerId: string, rng: Rng): void {
  const free = state.cards.filter((c) => c.owner_id === null);
  const card = pickRandom(free, rng);
  if (card) card.owner_id = playerId;
}

function allCardsPicked(state: RoomState): boolean {
  return state.players.every((p) => cardIndexOf(state, p.id) !== null);
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

function startRound(state: RoomState, now: number, rng: Rng = Math.random): void {
  state.round++;
  state.phase = "voting";
  state.votes = {};
  state.mr_white_guesser = null;
  const alive = alivePlayers(state);
  // Mr. White tidak disuruh memberi clue pertama selama masih ada pemain lain.
  const candidates = alive.filter((p) => p.role !== "mr_white");
  state.first_clue_player_id = (pickRandom(candidates.length ? candidates : alive, rng) ?? null)?.id ?? null;
  state.deadline = state.settings.vote_duration > 0 ? now + state.settings.vote_duration * 1000 : null;
}

function removeVotesInvolving(state: RoomState, playerId: string): void {
  // Vote "skip" tetap berlaku; hanya vote dari / untuk pemain ini yang dihapus.
  delete state.votes[playerId];
  for (const [voter, target] of Object.entries(state.votes)) {
    if (target === playerId) delete state.votes[voter];
  }
}

function allVoted(state: RoomState): boolean {
  return alivePlayers(state).every((p) => state.votes[p.id] !== undefined);
}

/**
 * Vote untuk pemain (boleh diri sendiri) atau SKIP_VOTE. Mengembalikan `true`
 * jika voting langsung direkap karena semua pemain hidup sudah memilih.
 */
export function submitVote(state: RoomState, voterId: string, targetId: string, now: number, rng: Rng = Math.random): boolean {
  if (state.phase !== "voting") throw new GameError("Sekarang bukan fase voting");
  const voter = findPlayer(state, voterId);
  if (!voter.alive) throw new GameError("Pemain yang tereliminasi tidak bisa voting");
  if (targetId !== SKIP_VOTE && !findPlayer(state, targetId).alive) {
    throw new GameError("Pemain tersebut sudah tereliminasi");
  }

  state.votes[voterId] = targetId;
  if (allVoted(state)) {
    resolveVotes(state, now, rng);
    return true;
  }
  return false;
}

/** Membatalkan vote sendiri selama voting masih berjalan. */
export function cancelVote(state: RoomState, voterId: string): void {
  if (state.phase !== "voting") throw new GameError("Sekarang bukan fase voting");
  if (state.votes[voterId] === undefined) throw new GameError("Kamu belum vote");
  delete state.votes[voterId];
}

export function tallyVotes(votes: Record<string, string>): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  return tally;
}

export function resolveVotes(state: RoomState, now: number, rng: Rng = Math.random): void {
  if (state.phase !== "voting") return;
  const tally = tallyVotes(state.votes);
  const entries = Object.entries(tally);
  const max = Math.max(0, ...entries.map(([, n]) => n));
  const top = entries.filter(([, n]) => n === max);
  const base = { round: state.round, player_id: null, role: null, tally };

  if (max === 0 || top.length !== 1) {
    state.eliminations.push({ ...base, tie: true, skipped: false });
    startRound(state, now, rng);
    return;
  }
  if (top[0]![0] === SKIP_VOTE) {
    state.eliminations.push({ ...base, tie: false, skipped: true });
    startRound(state, now, rng);
    return;
  }

  const eliminated = findPlayer(state, top[0]![0]);
  eliminated.alive = false;
  eliminated.eliminated_round = state.round;
  state.eliminations.push({ ...base, player_id: eliminated.id, role: eliminated.role, tie: false, skipped: false });

  if (eliminated.role === "mr_white") {
    state.phase = "mr_white_guess";
    state.mr_white_guesser = eliminated.id;
    state.deadline = now + LIMITS.MR_WHITE_GUESS_DURATION * 1000;
    return;
  }
  continueOrEnd(state, now, rng);
}

export function submitMrWhiteGuess(state: RoomState, playerId: string, guess: string, now: number, rng: Rng = Math.random): boolean {
  if (state.phase !== "mr_white_guess") throw new GameError("Sekarang bukan fase tebakan Mr. White");
  if (state.mr_white_guesser !== playerId) throw new GameError("Hanya Mr. White yang tereliminasi yang bisa menebak");
  if (!guess.trim()) throw new GameError("Tebakan tidak boleh kosong");
  return resolveMrWhiteGuess(state, playerId, guess, now, rng);
}

function resolveMrWhiteGuess(state: RoomState, playerId: string, guess: string, now: number, rng: Rng): boolean {
  const correct = !!state.word_a && !!guess.trim() && normalizeWord(guess) === normalizeWord(state.word_a);
  state.mr_white_guess = { player_id: playerId, guess: guess.trim(), correct };
  state.mr_white_guesser = null;
  if (correct) endGame(state, "mr_white", now);
  else continueOrEnd(state, now, rng);
  return correct;
}

function continueOrEnd(state: RoomState, now: number, rng: Rng): void {
  const winner = checkWinner(state);
  if (winner) endGame(state, winner, now);
  else startRound(state, now, rng);
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

function resetGameFields(state: RoomState): void {
  state.round = 0;
  state.cards = [];
  state.first_clue_player_id = null;
  state.deadline = null;
  state.word_a = null;
  state.word_b = null;
  state.category = null;
  state.word_submissions = {};
  state.word_author_id = null;
  state.votes = {};
  state.eliminations = [];
  state.mr_white_guesser = null;
  state.mr_white_guess = null;
  state.winner_role = null;
  state.started_at = null;
  state.ended_at = null;
  for (const p of state.players) {
    p.alive = true;
    p.role = null;
    p.eliminated_round = null;
  }
}

function backToLobby(state: RoomState): void {
  state.players = state.players.filter((p) => p.connected && !p.left);
  resetGameFields(state);
  state.phase = "lobby";
}

/** Kembali ke lobby setelah game selesai (dipanggil host). */
export function resetToLobby(state: RoomState, playerId: string): void {
  if (state.host_id !== playerId) throw new GameError("Hanya host yang bisa kembali ke lobby");
  if (state.phase !== "ended") throw new GameError("Game belum selesai");
  backToLobby(state);
}

/**
 * Menangani deadline yang terlewat (pilih kartu, voting, atau tebakan Mr. White).
 * Mengembalikan `true` jika state berubah.
 */
export function handleTimeout(state: RoomState, now: number, rng: Rng = Math.random): boolean {
  if (state.deadline === null || now < state.deadline) return false;
  switch (state.phase) {
    case "card_pick":
      // Pemain yang belum memilih mendapat kartu acak dari sisa kartu.
      for (const p of state.players) if (cardIndexOf(state, p.id) === null) assignRandomCard(state, p.id, rng);
      startRound(state, now, rng);
      return true;
    case "voting":
      resolveVotes(state, now, rng);
      return true;
    case "mr_white_guess":
      if (state.mr_white_guesser) resolveMrWhiteGuess(state, state.mr_white_guesser, "", now, rng);
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
  const showVotes = state.settings.vote_visibility === "show";
  const me = state.players.find((p) => p.id === viewerId) ?? null;
  const myCard = me ? cardIndexOf(state, me.id) : null;
  // Kata & role baru terlihat setelah pemain membuka kartunya.
  const revealedRole = myCard !== null ? me!.role : null;
  const myWord =
    revealedRole === "citizen" ? state.word_a : revealedRole === "undercover" ? state.word_b : null;
  const roleVisible = (p: Player) =>
    ended || (!p.alive && p.role !== null) || (p.id === viewerId && revealedRole === "mr_white");
  const ownerRole = (ownerId: string | null) => {
    const owner = ownerId ? state.players.find((p) => p.id === ownerId) : undefined;
    return owner && roleVisible(owner) ? owner.role : null;
  };

  return {
    room_id: state.room_id,
    host_id: state.host_id,
    phase: state.phase,
    settings: state.settings,
    round: state.round,
    first_clue_player_id: state.first_clue_player_id,
    deadline: state.deadline,
    server_now: now,
    cards: state.cards.map((c) => ({ index: c.index, owner_id: c.owner_id, role: ownerRole(c.owner_id) })),
    word_submitted_ids: Object.keys(state.word_submissions),
    // Mode hide: pemain hanya tahu siapa yang sudah vote, bukan pilihannya.
    voted_ids: Object.keys(state.votes),
    votes: showVotes ? state.votes : me && state.votes[me.id] ? { [me.id]: state.votes[me.id]! } : {},
    vote_tally: showVotes ? tallyVotes(state.votes) : {},
    eliminations: state.eliminations,
    mr_white_guesser: state.mr_white_guesser,
    mr_white_guess: state.mr_white_guess,
    winner_role: state.winner_role,
    word_a: ended ? state.word_a : null,
    word_b: ended ? state.word_b : null,
    category: ended ? state.category : null,
    word_author_id: ended ? state.word_author_id : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      connected: p.connected,
      alive: p.alive,
      left: p.left,
      eliminated_round: p.eliminated_round,
      role: roleVisible(p) ? p.role : null,
    })),
    me: me
      ? {
          id: me.id,
          is_host: state.host_id === me.id,
          card_index: myCard,
          is_mr_white: revealedRole === "mr_white",
          word: myWord,
          submitted_words: state.word_submissions[me.id] ?? null,
        }
      : null,
  };
}

export type PublicRoomView = ReturnType<typeof publicView>;
