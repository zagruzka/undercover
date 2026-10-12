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
- **Backend** menyimpan state game di Redis dengan key `room:{room_id}` (players, current_turn_index, phase, word_a, word_b, votes, …) dan chat di `room:{room_id}:chat`. Hasil game yang selesai disimpan ke `game_histories` & `game_participants`.
- Setiap pemain menerima state yang sudah disaring (`publicView`): role dan kata pemain lain tidak pernah dikirim ke browser sampai game selesai.

### Event WebSocket

Format pesan: `{ "event": string, "data": object }`.

| Client → Server | Data | Keterangan |
| --- | --- | --- |
| `room:create` | – | Membuat room (kode 5 karakter) dan menjadi host |
| `room:join` | `{ room_id }` | Bergabung / menyambung ulang ke room |
| `room:leave` | – | Keluar room (saat game berjalan = tereliminasi) |
| `room:update_settings` | `{ settings }` | Host mengatur jumlah Undercover, Mr. White, durasi giliran & voting |
| `game:start` | – | Ambil kata acak dari PostgreSQL, bagikan role tersembunyi |
| `game:submit_description` | `{ text }` | Kirim petunjuk dan pindah giliran |
| `game:submit_vote` | `{ target_id }` | Vote realtime (bisa diubah sampai semua memilih / waktu habis) |
| `game:mr_white_guess` | `{ guess }` | Tebakan Mr. White yang tereliminasi |
| `game:reset` | – | Host kembali ke lobby setelah game selesai |
| `chat:send_message` | `{ text }` | Chat room |

Server → client: `connection:ready`, `room:joined`, `room:state`, `room:left`, `chat:message`, `error`, `pong`.

### Aturan

- **Citizen** mendapat kata A, **Undercover** mendapat kata B yang mirip. Keduanya tidak diberi tahu perannya, hanya katanya.
- **Mr. White** tidak mendapat kata (hanya teks "Anda adalah Mr. White") dan tidak pernah mendapat giliran pertama.
- Giliran yang habis waktunya dilewati otomatis. Voting seri berarti tidak ada yang tereliminasi, lalu ronde baru dimulai.
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
bun test                 # unit test logika game (role, giliran, voting, kondisi menang, Mr. White)
bun run smoke            # simulasi 3 pemain lewat WebSocket (server harus berjalan)
bun run typecheck

cd frontend
npm run lint && npm run build
```

## Catatan

- Koneksi, timer giliran, dan lock per-room disimpan in-memory di proses backend, jadi backend harus berjalan sebagai **satu proses**. `reusePort` sengaja dimatikan supaya proses kedua gagal start, bukan diam-diam berbagi port. Untuk skala multi-instance perlu Redis pub/sub dan distributed lock.
- Saat backend restart, timer room yang aktif dipulihkan dari Redis dan klien menyambung ulang otomatis.
