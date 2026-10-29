import { Menu } from "lucide-react";
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
    <div className="shrink-0 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            aria-keyshortcuts="Control+b"
          >
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
    </div>
  );
}
