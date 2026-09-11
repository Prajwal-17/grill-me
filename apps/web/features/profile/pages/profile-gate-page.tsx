"use client";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BrandMark } from "../../../shared/components/brand";
import { Input } from "../../../shared/components/ui/input";
import { Button } from "../../../shared/components/ui/button";
import { ThemeSelect } from "../../../shared/components/theme-provider";
import { startProfile } from "../api/profile-api";
import { storeProfile } from "../lib/profile-storage";

export function ProfileGatePage() {
  const [email, setEmail] = useState("");
  const start = useMutation({
    mutationFn: () => startProfile(email),
    onSuccess: storeProfile,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) start.mutate();
  }
  return (
    <main className="flex min-h-dvh flex-col gap-12 px-5 pb-16">
      <div className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <BrandMark />
          Grill Me
        </span>
        <div className="w-48">
          <ThemeSelect />
        </div>
      </div>
      <section className="mx-auto my-auto w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7 shadow-xs sm:p-8">
        <h1 className="page-title">Ready to build?</h1>
        <form onSubmit={submit} className="mt-8 grid gap-4">
          <label className="field-label" htmlFor="email">
            Email
            <Input
              id="email"
              name="email"
              className="h-11"
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
