import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth, isGoogleEnabled, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 text-5xl" aria-hidden>
            🕵️
          </div>
          <CardTitle className="text-2xl">Undercover</CardTitle>
          <CardDescription>Game tebak kata tatap muka. Siapa yang menyamar di antara kalian?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <form action={guestLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="player_name">Nama pemain</Label>
              <Input
                id="player_name"
                name="player_name"
                placeholder="mis. Budi"
                required
                minLength={2}
                maxLength={32}
                autoComplete="nickname"
                className="h-11"
              />
            </div>
            <Button type="submit" size="lg" className="h-11 w-full">
              Masuk sebagai Guest
            </Button>
          </form>

          {isGoogleEnabled && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" />
                atau
                <Separator className="flex-1" />
              </div>
              <form action={googleLogin}>
                <Button type="submit" variant="outline" size="lg" className="h-11 w-full">
                  <GoogleIcon />
                  Login dengan Google
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
