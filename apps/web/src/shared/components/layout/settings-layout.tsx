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
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const label =
    kind === "settings" ? "Settings sections" : "Preference sections";
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col md:flex-row">
      <aside
        aria-label={label}
        className="hidden w-52 shrink-0 overflow-y-auto py-6 pl-6 pr-2 md:block"
      >
        <nav aria-label={label}>
          <SettingsSectionNavigation kind={kind} />
        </nav>
      </aside>
      <div className="shrink-0 px-4 pt-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" aria-label={`Open ${label.toLowerCase()}`}>
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
      <main
        ref={panel}
        data-slot="settings-content"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-6 md:py-6"
      >
        <div className="@container w-full max-w-[800px]">{children}</div>
      </main>
    </div>
  );
}
