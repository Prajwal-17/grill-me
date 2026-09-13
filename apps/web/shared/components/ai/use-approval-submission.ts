"use client";
import { useEffect, useRef } from "react";

// Pass the selected answer into the delayed callback rather than reading a
// previous render's answers, as the gallery demo's auto-advance timer does.
export function useApprovalSubmission(
  busy: boolean,
  onAnswer: (answer: string) => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitted = useRef(false);
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => {
    if (!busy) submitted.current = false;
    else if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [busy]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function submit(value: string) {
    cancel();
    if (busy || submitted.current || !value.trim()) return;
    submitted.current = true;
    onAnswer(value.trim());
  }
  function select(value: string) {
    cancel();
    timer.current = setTimeout(() => submit(value), 480);
  }
  return { cancel, submit, select };
}
