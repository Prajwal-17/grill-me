import Image from "next/image";
import { cn } from "@/shared/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src="/icon.svg"
        width={160}
        height={160}
        alt=""
        unoptimized
        className="size-full scale-[1.12] object-contain drop-shadow-[0_0_6px_rgb(245_123_66/0.16)]"
      />
    </span>
  );
}

export function BrandLockup({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap",
        className,
      )}
    >
      <BrandMark className={cn("size-11", markClassName)} />
      <span
        className={cn(
          "font-mono text-[18px] font-medium leading-none tracking-[-0.055em] text-foreground",
          wordmarkClassName,
        )}
      >
        Grill Me
      </span>
    </span>
  );
}
