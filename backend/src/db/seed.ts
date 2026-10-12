import { db, sql } from "./index";
import { word_banks } from "./schema";

type Seed = typeof word_banks.$inferInsert;

const words: Seed[] = [
  { word_a: "Kopi", word_b: "Teh", category: "Minuman", difficulty: "easy" },
  { word_a: "Bakso", word_b: "Mie Ayam", category: "Makanan", difficulty: "easy" },
  { word_a: "Nasi Goreng", word_b: "Mie Goreng", category: "Makanan", difficulty: "easy" },
  { word_a: "Sate", word_b: "Gulai", category: "Makanan", difficulty: "medium" },
  { word_a: "Rendang", word_b: "Semur", category: "Makanan", difficulty: "medium" },
  { word_a: "Martabak", word_b: "Terang Bulan", category: "Makanan", difficulty: "hard" },
  { word_a: "Es Teh", word_b: "Es Jeruk", category: "Minuman", difficulty: "easy" },
  { word_a: "Kucing", word_b: "Harimau", category: "Hewan", difficulty: "easy" },
  { word_a: "Ayam", word_b: "Bebek", category: "Hewan", difficulty: "easy" },
  { word_a: "Buaya", word_b: "Komodo", category: "Hewan", difficulty: "medium" },
  { word_a: "Pantai", word_b: "Danau", category: "Tempat", difficulty: "easy" },
  { word_a: "Gunung", word_b: "Bukit", category: "Tempat", difficulty: "medium" },
  { word_a: "Pasar", word_b: "Mal", category: "Tempat", difficulty: "easy" },
  { word_a: "Masjid", word_b: "Gereja", category: "Tempat", difficulty: "medium" },
  { word_a: "Sekolah", word_b: "Kampus", category: "Tempat", difficulty: "easy" },
  { word_a: "Motor", word_b: "Sepeda", category: "Kendaraan", difficulty: "easy" },
  { word_a: "Kereta", word_b: "Bus", category: "Kendaraan", difficulty: "easy" },
  { word_a: "Ojek", word_b: "Becak", category: "Kendaraan", difficulty: "medium" },
  { word_a: "Pesawat", word_b: "Helikopter", category: "Kendaraan", difficulty: "medium" },
  { word_a: "Dokter", word_b: "Perawat", category: "Profesi", difficulty: "easy" },
  { word_a: "Polisi", word_b: "Tentara", category: "Profesi", difficulty: "medium" },
  { word_a: "Guru", word_b: "Dosen", category: "Profesi", difficulty: "medium" },
  { word_a: "Batik", word_b: "Tenun", category: "Budaya", difficulty: "hard" },
  { word_a: "Wayang", word_b: "Ondel-ondel", category: "Budaya", difficulty: "hard" },
  { word_a: "Angklung", word_b: "Gamelan", category: "Budaya", difficulty: "hard" },
  { word_a: "Sepak Bola", word_b: "Futsal", category: "Olahraga", difficulty: "medium" },
  { word_a: "Bulu Tangkis", word_b: "Tenis", category: "Olahraga", difficulty: "medium" },
  { word_a: "Lebaran", word_b: "Natal", category: "Perayaan", difficulty: "medium" },
  { word_a: "Payung", word_b: "Jas Hujan", category: "Benda", difficulty: "easy" },
  { word_a: "Sendok", word_b: "Garpu", category: "Benda", difficulty: "easy" },
];

const existing = await db.$count(word_banks);
if (existing > 0) {
  console.log(`word_banks sudah berisi ${existing} baris, seeding dilewati.`);
} else {
  await db.insert(word_banks).values(words);
  console.log(`Berhasil menambahkan ${words.length} pasang kata ke word_banks.`);
}

await sql.end();
