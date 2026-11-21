import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { createActivityScroller } from "../lib/activity-scroll";

const followThreshold = 32;

/** Follow new messages without taking control away from someone reading history. */
export function useFollowActivity({
  active,
  ready,
  resetKey,
}: {
  active: boolean;
  ready: boolean;
  resetKey: string;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(active);
  const lastResetKey = useRef<string | null>(null);
  const lastScrollTop = useRef(0);
  const [following, setFollowing] = useState(active);
  const scrollerRef = useRef<ReturnType<typeof createActivityScroller> | null>(
    null,
  );
  const getScroller = useCallback(() => {
    if (!scrollerRef.current)
      scrollerRef.current = createActivityScroller({
        pane: () => paneRef.current,
        request: (frame) => requestAnimationFrame(frame),
        cancel: (id) => cancelAnimationFrame(id),
        reducedMotion: () =>
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    return scrollerRef.current;
  }, []);

  const setFollow = useCallback(
    (next: boolean) => {
      if (followingRef.current === next) return;
      followingRef.current = next;
      setFollowing(next);
    },
    [setFollowing],
  );

  const pause = useCallback(() => {
    getScroller().cancel();
    setFollow(false);
  }, [getScroller, setFollow]);

  const onScroll = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const scroller = getScroller();
    const movedUp = pane.scrollTop < lastScrollTop.current - 1;
    lastScrollTop.current = pane.scrollTop;
    if (movedUp && scroller.animating) pause();
    if (scroller.animating) return;
    setFollow(
      pane.scrollHeight - pane.scrollTop - pane.clientHeight <=
        (followingRef.current ? followThreshold : 1),
    );
  }, [pause, getScroller, setFollow]);

  const onWheel = useCallback(
    (event: WheelEvent) => {
      if (event.deltaY < 0) pause();
    },
    [pause],
  );
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Scrollbar dragging and opening tool details are deliberate reading actions.
      if (
        event.target === event.currentTarget ||
        (event.target as Element).closest("summary")
      )
        pause();
    },
    [pause],
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable='true']")) return;
      if (
        ["ArrowUp", "PageUp", "Home"].includes(event.key) ||
        (event.key === " " && event.shiftKey) ||
        (target.closest("summary") && ["Enter", " "].includes(event.key))
      )
        pause();
    },
    [pause],
  );

  const jumpToLatest = useCallback(() => {
    setFollow(true);
    getScroller().follow();
  }, [getScroller, setFollow]);

  useLayoutEffect(() => {
    const scroller = getScroller();
    if (lastResetKey.current !== resetKey) scroller.cancel();
    if (!ready || lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    setFollow(active);
    // Position once before loaded messages paint, never on a run-state change.
    scroller.align(active ? "end" : "start");
    lastScrollTop.current = paneRef.current?.scrollTop ?? 0;
  }, [active, ready, resetKey, getScroller, setFollow]);

  useEffect(() => {
    const content = contentRef.current;
    if (!ready || !content) return;
    const scroller = getScroller();
    const observer = new ResizeObserver(() => {
      if (followingRef.current) scroller.follow();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [ready, resetKey, getScroller]);

  useEffect(() => {
    const scroller = getScroller();
    return () => scroller.cancel();
  }, [getScroller]);

  return {
    paneRef,
    contentRef,
    following,
    onScroll,
    onWheel,
    onPointerDown,
    onKeyDown,
    onTouchStart: pause,
    pause,
    jumpToLatest,
  };
}
