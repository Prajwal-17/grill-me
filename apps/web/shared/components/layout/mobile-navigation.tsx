"use client";
import Link from "next/link";
import { Menu } from "lucide-react";
import { BrandMark } from "../brand";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "../ui/sheet";
import type { Profile } from "../../types/api";
import { Navigation } from "./navigation";

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
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
        <BrandMark className="size-9" />
        Grill Me
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
