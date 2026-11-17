type Pane = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">;

/** One interruptible animation whose destination tracks growing chat content. */
export function createActivityScroller({
  pane,
  request,
  cancel,
  reducedMotion,
}: {
  pane: () => Pane | null;
  request: (frame: (time: number) => void) => number;
  cancel: (id: number) => void;
  reducedMotion: () => boolean;
}) {
  let frame: number | null = null;
  let started: number | null = null;
  let from = 0;

  function stop() {
    if (frame !== null) cancel(frame);
    frame = null;
    started = null;
  }

  function bottom(element: Pane) {
    return Math.max(0, element.scrollHeight - element.clientHeight);
  }

  function tick(time: number) {
    const element = pane();
    if (!element) return stop();
    started ??= time;
    const progress = reducedMotion() ? 1 : Math.min(1, (time - started) / 240);
    const eased = 1 - (1 - progress) ** 3;
    element.scrollTop = from + (bottom(element) - from) * eased;
    if (progress === 1) {
      frame = null;
      started = null;
    } else frame = request(tick);
  }

  return {
    cancel: stop,
    get animating() {
      return frame !== null;
    },
    align(position: "start" | "end") {
      stop();
      const element = pane();
      if (element) element.scrollTop = position === "end" ? bottom(element) : 0;
    },
    follow() {
      const element = pane();
      if (!element) return;
      if (reducedMotion()) {
        stop();
        element.scrollTop = bottom(element);
        return;
      }
      if (frame !== null || Math.abs(bottom(element) - element.scrollTop) < 1)
        return;
      from = element.scrollTop;
      started = null;
      frame = request(tick);
    },
  };
}
