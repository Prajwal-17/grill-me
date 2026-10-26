// Typing state machine adapted from Magic UI's Typing Animation (MIT; see LICENSE).
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

export function TypingSuggestion({ words }: { words: readonly string[] }) {
  const reducedMotion = useReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "deleting">("typing");

  useEffect(() => {
    if (reducedMotion || words.length === 0) return;
    const word = Array.from(words[wordIndex] ?? "");
    const delay = phase === "typing" ? 42 : phase === "deleting" ? 22 : 1_400;
    const timeout = window.setTimeout(() => {
      if (phase === "typing") {
        if (characterIndex < word.length)
          setCharacterIndex((index) => index + 1);
        else setPhase("pause");
      } else if (phase === "pause") {
        setPhase("deleting");
      } else if (characterIndex > 0) {
        setCharacterIndex((index) => index - 1);
      } else {
        setWordIndex((index) => (index + 1) % words.length);
        setPhase("typing");
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [characterIndex, phase, reducedMotion, wordIndex, words]);

  const text = reducedMotion
    ? (words[0] ?? "")
    : Array.from(words[wordIndex] ?? "")
        .slice(0, characterIndex)
        .join("");

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-4 top-4 line-clamp-3 whitespace-pre-wrap text-base leading-6 text-muted"
    >
      {text}
      {!reducedMotion && (
        <span className="ml-px inline-block h-[1.05em] w-px translate-y-[2px] animate-[typing-cursor_800ms_steps(1,end)_infinite] bg-muted" />
      )}
    </span>
  );
}
