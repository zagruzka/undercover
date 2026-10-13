import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth, isGoogleEnabled, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_name: "Nama harus 2–32 karakter.",
  CredentialsSignin: "Gagal masuk sebagai guest, coba lagi.",
};

function safeCallback(value: string | string[] | undefined): string {
  const url = typeof value === "string" ? value : "/";
  return url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense>
      <LoginContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function LoginContent(props: Pick<PageProps<"/login">, "searchParams">) {
  const searchParams = await props.searchParams;
  const callbackUrl = safeCallback(searchParams.callbackUrl);
  await connection(); // lihat catatan di lib/session.ts
  const session = await auth();
  if (session?.user?.id) redirect(callbackUrl);

  const errorCode = typeof searchParams.code === "string" ? searchParams.code : searchParams.error;
  const error = typeof errorCode === "string" ? (ERROR_MESSAGES[errorCode] ?? "Gagal masuk, coba lagi.") : null;

  async function guestLogin(formData: FormData) {
    "use server";
    try {
      await signIn("guest", { player_name: formData.get("player_name"), redirectTo: callbackUrl });
    } catch (err) {
      if (err instanceof AuthError) {
        const code = "code" in err && typeof err.code === "string" ? err.code : err.type;
        redirect(`/login?code=${encodeURIComponent(code)}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
      }
      throw err;
    }
  }

  async function googleLogin() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <section className="text-center">
          <div className="motion-safe:animate-wiggle text-8xl" aria-hidden>
            🕵️
          </div>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">
            Under<span className="text-primary">cover</span>
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">Game tebak kata seru bareng teman. Siapa yang menyamar?</p>
        </section>

        <section className="space-y-4 rounded-3xl border-2 border-white/10 bg-card/80 p-5 shadow-xl">
          {error && (
            <p role="alert" className="rounded-2xl bg-destructive/20 px-4 py-3 text-base font-semibold text-destructive">
              {error}
            </p>
          )}

          <form action={guestLogin} className="space-y-3">
            <label htmlFor="player_name" className="block font-display text-xl font-bold">
              Siapa namamu?
            </label>
            <Input
              id="player_name"
              name="player_name"
              placeholder="mis. Budi"
              required
              minLength={2}
              maxLength={32}
              autoComplete="nickname"
              className="h-14 rounded-2xl text-xl font-semibold"
            />
            <Button type="submit" size="lg" className="h-14 w-full rounded-2xl font-display text-xl font-bold">
              Main sebagai Guest 🎮
            </Button>
          </form>

          {isGoogleEnabled && (
            <>
              <div className="flex items-center gap-3 text-base text-muted-foreground">
                <Separator className="flex-1" />
                atau
                <Separator className="flex-1" />
              </div>
              <form action={googleLogin}>
                <Button type="submit" variant="outline" size="lg" className="h-14 w-full rounded-2xl text-lg font-semibold">
                  <GoogleIcon />
                  Login dengan Google
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
