import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { SettingsSectionNavigation } from "./settings-navigation";

export function SettingsLayout({
  activeSection,
  kind,
  children,
}: {
  activeSection: string;
  kind: "settings" | "preferences";
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label =
    kind === "settings" ? "Settings sections" : "Preference sections";
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  return (
    <div
      ref={panel}
      data-slot="settings-content"
      className="h-full min-h-0 overflow-y-auto overscroll-contain scroll-pt-14 [scrollbar-gutter:stable_both-edges] md:scroll-pt-0"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col md:flex-row">
        <aside
          aria-label={label}
          className="sticky top-0 hidden w-52 shrink-0 self-start py-4 pl-6 pr-2 md:block"
        >
          <nav aria-label={label}>
            <SettingsSectionNavigation kind={kind} />
          </nav>
        </aside>
        <div className="sticky top-0 z-10 shrink-0 bg-canvas px-4 pt-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                aria-label={`Open ${label.toLowerCase()}`}
              >
                <Menu size={16} />
                Sections
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] bg-canvas p-3 pt-12"
              aria-describedby={undefined}
            >
              <SheetTitle className="sr-only">{label}</SheetTitle>
              <nav aria-label={label}>
                <SettingsSectionNavigation
                  kind={kind}
                  close={() => setOpen(false)}
                />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:pb-6 md:pt-5">
          <div className="@container w-full max-w-[960px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
