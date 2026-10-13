# 🕵️ Undercover

Game kata sosial **Undercover** untuk dimainkan tatap muka: setiap pemain membuka web dari HP masing-masing, permainan berjalan realtime lewat WebSocket.

```
undercover/
├── backend/    Bun + Elysia.js (WebSocket native), Drizzle ORM, PostgreSQL, Redis
└── frontend/   Next.js 16 (App Router), Tailwind CSS, shadcn/ui, Auth.js (NextAuth v5)
```

## Arsitektur

- **Frontend** menangani login (Google / Guest) lewat Auth.js. Saat login, server Next.js memanggil `POST /api/auth/sync` di backend (dilindungi `INTERNAL_API_SECRET`) untuk membuat/mengambil user di PostgreSQL.
- Browser meminta token pendek dari `GET /api/ws-token` (JWT HS256, ditandatangani `WS_JWT_SECRET`), lalu membuka WebSocket ke `ws://localhost:4000/ws?token=…`.
- **Backend** menyimpan state game di Redis dengan key `room:{room_id}` (players, cards, phase, word_a, word_b, votes, …) dan chat di `room:{room_id}:chat`. Hasil game yang selesai disimpan ke `game_histories` & `game_participants`.
- Setiap pemain menerima state yang sudah disaring (`publicView`): role dan kata pemain lain tidak pernah dikirim ke browser sampai game selesai, dan kata milik sendiri baru dikirim setelah kartunya diambil.

### Alur permainan

```
lobby → [word_submit] → card_pick → voting ⇄ mr_white_guess → ended
```

1. **Lobby**: host memilih mode kata (📚 Bank Kata / ✍️ Kata Sendiri), jumlah Undercover & Mr. White, dan waktu voting (∞ atau 30–180 detik).
2. **Kirim kata** (khusus mode Kata Sendiri): setiap pemain mengirim sepasang kata mirip. Setelah semua mengirim (atau host menekan "Lanjut"), sistem mengacak satu pasangan dan mengacak mana yang menjadi kata Citizen. Penyumbang pasangan terpilih tidak pernah menjadi Mr. White karena sudah tahu kedua kata.
3. **Rebut kartu**: ada satu kartu tertutup per pemain. Pemain berebut mengetuk kartu; kartu yang terpilih terbuka dengan animasi flip + zoom, sedangkan pemain lain melihatnya terkunci atas nama pemiliknya. Setelah 30 detik, sisa kartu dibagikan acak.
4. **Voting**: sistem menunjuk siapa yang memberi clue pertama. Clue diberikan bebas lewat chat atau langsung, lalu pemain mengetuk kartu tersangka; setiap suara tampil sebagai tanda ✓ di kartu. Voting selesai saat semua pemain hidup sudah memilih (atau waktu habis jika tidak ∞). Pemain tereliminasi ditandai silang besar dan role-nya terbuka.

**Race condition kartu:** setiap event yang mengubah state room diproses berurutan per-room (`withRoomLock` di `backend/src/game/store.ts`), dan `pickCard` menolak kartu yang sudah punya pemilik. Jadi jika dua pemain mengetuk kartu yang sama bersamaan, hanya yang pertama diproses yang mendapatkannya; yang lain menerima error "Kartu sudah diambil" dan memilih kartu lain.

### Event WebSocket

Format pesan: `{ "event": string, "data": object }`.

| Client → Server | Data | Keterangan |
| --- | --- | --- |
| `room:create` | – | Membuat room (kode 5 karakter) dan menjadi host |
| `room:join` | `{ room_id }` | Bergabung / menyambung ulang ke room |
| `room:leave` | – | Keluar room (setelah kartu dibagikan = tereliminasi) |
| `room:update_settings` | `{ settings }` | Host mengatur `undercover_count`, `mr_white_count`, `vote_duration` (0 = ∞), `word_mode` |
| `game:start` | – | Mode bank: ambil kata acak dari PostgreSQL & bagikan kartu. Mode kata sendiri: buka fase kirim kata |
| `game:submit_words` | `{ word_a, word_b }` | Mengirim / mengubah pasangan kata (mode kata sendiri) |
| `game:force_word_start` | – | Host melanjutkan dengan kata yang sudah terkumpul |
| `game:pick_card` | `{ card_index }` | Mengambil kartu |
| `game:submit_vote` | `{ target_id }` | Vote realtime (bisa diubah sampai semua memilih) |
| `game:mr_white_guess` | `{ guess }` | Tebakan Mr. White yang tereliminasi |
| `game:reset` | – | Host kembali ke lobby setelah game selesai |
| `chat:send_message` | `{ text }` | Chat room, termasuk untuk memberi clue |

Server → client: `connection:ready`, `room:joined`, `room:state`, `room:left`, `chat:message`, `error`, `pong`.

### Aturan

- **Citizen** mendapat kata A, **Undercover** mendapat kata B yang mirip. Keduanya tidak diberi tahu perannya, hanya katanya.
- **Mr. White** tidak mendapat kata (kartunya bertuliskan "Anda adalah Mr. White") dan tidak pernah ditunjuk memberi clue pertama.
- Voting seri berarti tidak ada yang tereliminasi, lalu ronde voting baru dimulai.
- Mr. White yang tereliminasi mendapat 45 detik untuk menebak kata Citizen. Jika benar, Mr. White langsung menang.
- Citizen menang jika semua Undercover & Mr. White tereliminasi. Undercover menang jika jumlahnya ≥ Citizen yang tersisa. Mr. White menang jika tebakannya benar atau dia termasuk 2 pemain terakhir.

## Menjalankan secara lokal

Prasyarat: [Bun](https://bun.sh) ≥ 1.2, Node.js ≥ 20, PostgreSQL, dan Redis/Valkey.

### 1. Database & Redis

```bash
createdb -U postgres undercover            # atau: psql -U postgres -c "CREATE DATABASE undercover"
sudo systemctl enable --now valkey          # atau redis
```

### 2. Backend

```bash
cd backend
cp .env.example .env                        # isi INTERNAL_API_SECRET & WS_JWT_SECRET (openssl rand -hex 32)
bun install
bun run db:migrate                          # terapkan migrasi Drizzle (folder drizzle/)
bun run db:seed                             # 30 pasang kata bahasa Indonesia
bun run dev                                 # http://localhost:4000, WebSocket di /ws
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local                  # INTERNAL_API_SECRET & WS_JWT_SECRET harus sama dengan backend
                                            # AUTH_SECRET: openssl rand -base64 32
npm install
npm run dev                                 # http://localhost:3000
```

Untuk main bersama dari HP di jaringan Wi-Fi yang sama, ganti `localhost` dengan IP komputer (mis. `192.168.1.10`) di `NEXT_PUBLIC_WS_URL` (frontend), `FRONTEND_ORIGIN` (backend), lalu jalankan frontend dengan `npm run dev -- -H 0.0.0.0`.

### Login Google (opsional)

Buat OAuth Client ID di Google Cloud Console dengan redirect URI `http://localhost:3000/api/auth/callback/google`, lalu isi `AUTH_GOOGLE_ID` dan `AUTH_GOOGLE_SECRET` di `frontend/.env.local`. Jika kosong, tombol Google disembunyikan dan login Guest tetap berfungsi.

## Pengujian

```bash
cd backend
bun test                 # unit test logika game (kartu, voting, kata sendiri, kondisi menang, Mr. White)
bun run smoke            # 3 pemain lewat WebSocket, termasuk rebutan kartu bersamaan (server harus berjalan)
bun run typecheck

cd frontend
npm run lint && npm run build
```

## Catatan

- Koneksi, timer, dan lock per-room disimpan in-memory di proses backend, jadi backend harus berjalan sebagai **satu proses**. `reusePort` sengaja dimatikan supaya proses kedua gagal start, bukan diam-diam berbagi port. Untuk skala multi-instance perlu Redis pub/sub dan distributed lock.
- Saat backend restart, timer room yang aktif dipulihkan dari Redis dan klien menyambung ulang otomatis.
