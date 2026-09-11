"use client";
// Adapted from Beautiful UI's StreamingText; driven by the actual request state.
import { motion, useReducedMotion } from "motion/react";
export function StreamingStatus({ label = "Thinking…" }: { label?: string }) {
  const reduced = useReducedMotion();
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2.5 text-xs text-muted"
    >
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1 rounded-full bg-current"
            animate={reduced ? {} : { opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
