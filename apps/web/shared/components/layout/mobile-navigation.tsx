"use client";
import Link from "next/link";
import { Menu } from "lucide-react";
import { BrandLockup } from "@/shared/components/brand";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import type { Profile } from "@/shared/types/api";
import { Navigation } from "@/shared/components/layout/navigation";

export function MobileNavigation({
  profile,
  open,
  setOpen,
}: {
  profile: Profile;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-canvas px-4 md:hidden">
      <Link href="/" aria-label="Grill Me home" className="rounded-lg">
        <BrandLockup markClassName="size-10" wordmarkClassName="text-[17px]" />
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu size={19} />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[280px] gap-0 border-r border-line bg-canvas p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate Grill Me
          </SheetDescription>
          <Navigation profile={profile} close={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
