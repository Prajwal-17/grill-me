import Image from "next/image";
import { cn } from "../lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center",
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
        className="size-full object-contain"
      />
    </span>
  );
}
