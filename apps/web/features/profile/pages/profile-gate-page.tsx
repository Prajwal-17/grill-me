"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../shared/components/ui/button";
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
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <section className="w-full max-w-md">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            Grill Me
          </h1>
          <p className="mt-2 text-sm text-muted">
            Enter your email to continue.
          </p>
        </header>

        <form className="grid gap-3" onSubmit={submit}>
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm outline-none transition placeholder:text-dim hover:border-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
            <Button type="submit" variant="primary" disabled={start.isPending}>
              {start.isPending && (
                <LoaderCircle className="animate-spin" size={15} />
              )}
              Continue
            </Button>
          </div>
          {start.error && (
            <p className="text-xs text-red-400" role="alert">
              {start.error.message}
            </p>
          )}
          <p className="text-xs text-dim">
            Used only to load your local history.
          </p>
        </form>
      </section>
    </main>
  );
}
