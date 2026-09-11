"use client";
import { useEffect, useRef, useState } from "react";
export function useDiscussionScroll([
  messages,
  reply,
  pending,
  tab,
]: readonly unknown[]) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  useEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, reply, pending, tab]);
  function resumeFollowing() {
    follow.current = true;
  }
  function onScroll() {
    const node = scroll.current;
    if (node) {
      follow.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 100;
      setShowLatest(!follow.current);
    }
  }
  function scrollToLatest() {
    follow.current = true;
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  return { scroll, showLatest, onScroll, scrollToLatest, resumeFollowing };
}
