import { auth } from "@/auth";
import { signBackendToken } from "@/lib/ws-token";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    { token: await signBackendToken(session.user) },
    { headers: { "cache-control": "no-store" } },
  );
}
