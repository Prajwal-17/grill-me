// Auto-sizing input adapted from Beautiful UI's PromptBar. See LICENSE.
import {
  useLayoutEffect,
  useRef,
  useImperativeHandle,
  type ComponentProps,
} from "react";
import { cn } from "@/shared/lib/cn";

export function PromptTextarea({
  value,
  className,
  ref: forwardedRef,
  minHeight = 76,
  ...props
}: ComponentProps<"textarea"> & { minHeight?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!, []);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      if (!input.clientWidth) return;
      input.style.height = "auto";
      input.style.height =
        Math.min(240, Math.max(minHeight, input.scrollHeight + 2)) + "px";
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value, minHeight]);
  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      className={cn(
        "block w-full resize-none bg-transparent px-4 py-4 text-base leading-6 outline-none placeholder:text-muted disabled:opacity-60",
        className,
      )}
    />
  );
}
