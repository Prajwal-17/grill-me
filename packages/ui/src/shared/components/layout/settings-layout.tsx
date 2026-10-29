import { useEffect, useRef, type ReactNode } from "react";

export function SettingsLayout({
  activeSection,
  navigation,
  children,
}: {
  activeSection: string;
  navigation: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const categories = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    const rail = categories.current;
    if (!rail) return;
    const revealActive = () => {
      rail
        .querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    revealActive();
    const resize = new ResizeObserver(revealActive);
    resize.observe(rail);
    return () => resize.disconnect();
  }, [activeSection]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col md:flex-row">
      <div
        ref={categories}
        className="shrink-0 overflow-x-auto border-b border-line p-3 md:w-44 md:overflow-y-auto md:border-r md:border-b-0"
      >
        {navigation}
      </div>
      <main
        ref={panel}
        data-slot="settings-content"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-6"
      >
        <div className="@container w-full max-w-[800px]">{children}</div>
      </main>
    </div>
  );
}
