import { SocketProvider } from "@/components/socket-provider";

/** Halaman di grup ini wajib memanggil `requireUser()` agar pengguna yang belum login diarahkan ke /login. */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>;
}
