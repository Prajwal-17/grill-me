import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** How close to the end the pane must be to keep following new activity. */
const followThreshold = 32;

/**
 * Keeps a scrollable transcript pane on its newest content while a run is
 * active. Opening an active run lands at the bottom, history-only sessions
 * open at the top, and scrolling away stops the follow until the reader
 * returns to the end.
 */
export function useFollowActivity({
  active,
  ready,
  resetKey,
}: {
  /** The rendered thread is still producing content. */
  active: boolean;
  /** The pane is mounted with its thread loaded. */
  ready: boolean;
  /** Changes when the selected session or category changes. */
  resetKey: string;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(active);
  const lastResetKey = useRef<string | null>(null);
  const [following, setFollowing] = useState(active);

  const setFollow = useCallback((next: boolean) => {
    if (followingRef.current === next) return;
    followingRef.current = next;
    setFollowing(next);
  }, []);

  const scrollToBottom = useCallback(() => {
    const pane = paneRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, []);

  const scrollToTop = useCallback(() => {
    const pane = paneRef.current;
    if (pane) pane.scrollTop = 0;
  }, []);

  const onScroll = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const remaining = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
    setFollow(remaining <= followThreshold);
  }, [setFollow]);

  const jumpToLatest = useCallback(() => {
    setFollow(true);
    scrollToBottom();
  }, [scrollToBottom, setFollow]);

  useLayoutEffect(() => {
    if (!ready) return;
    const switched = lastResetKey.current !== resetKey;
    lastResetKey.current = resetKey;
    if (active) {
      setFollow(true);
      scrollToBottom();
      return;
    }
    // A running session that finishes stays where the reader left it.
    if (!switched) return;
    setFollow(false);
    scrollToTop();
  }, [active, ready, resetKey, scrollToBottom, scrollToTop, setFollow]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [ready, resetKey, scrollToBottom]);

  return { paneRef, contentRef, following, onScroll, jumpToLatest };
}
