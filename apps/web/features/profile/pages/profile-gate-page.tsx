"use client";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../shared/components/ui/button";
import { ThemeSelect } from "../../../shared/components/theme-provider";
import { startProfile } from "../api/profile-api";
import { getStoredProfile, storeProfile } from "../lib/profile-storage";
export function ProfileGatePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (getStoredProfile()) router.replace("/exercises");
  }, [router]);
  const start = useMutation({
    mutationFn: () => startProfile(email),
    onSuccess: (profile) => {
      storeProfile(profile);
      router.push("/exercises");
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) start.mutate();
  }
  return (
    <main className="flex min-h-dvh flex-col px-6">
      <div className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">Grill Me.</span>
        <div className="w-44">
          <ThemeSelect />
        </div>
      </div>
      <section className="mx-auto my-auto w-full max-w-sm pb-20">
        <h1 className="page-title">Ready to practice?</h1>
        <form onSubmit={submit} className="mt-8 grid gap-4">
          <label className="field-label" htmlFor="email">
            Email
            <input
              id="email"
              name="email"
              className="field"
              type="email"
              autoComplete="email"
              required
              autoFocus
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              disabled={start.isPending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <Button type="submit" variant="primary" disabled={start.isPending}>
            {start.isPending && (
              <LoaderCircle size={16} className="animate-spin" />
            )}
            Continue
          </Button>
          <p className="text-xs text-muted">
            Your email loads your local profile.
          </p>
          {start.error && (
            <p role="alert" className="feedback">
              <AlertCircle size={16} className="shrink-0" />
              {start.error.message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
