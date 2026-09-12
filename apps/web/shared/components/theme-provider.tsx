"use client";
import { Moon, Sun } from "lucide-react";
import {
  APP_STORAGE_KEY,
  useAppStore,
  type Theme,
} from "@/shared/stores/app-store";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export const themeScript = `(function(){var t='dark';try{var s=JSON.parse(localStorage.getItem('${APP_STORAGE_KEY}')||'{}');t=s&&s.state&&s.state.theme==='light'?'light':'dark'}catch(e){}document.documentElement.dataset.theme=t})()`;

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const Icon = theme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Appearance"
          title="Appearance"
          className={compact ? "w-full px-0" : "w-full justify-start px-3"}
        >
          <Icon size={16} />
          {!compact && (
            <>
              <span>Appearance</span>
              <span className="ml-auto text-xs capitalize text-muted">
                {theme}
              </span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? "right" : "top"} align="start">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {[
            { id: "light", label: "Light", icon: Sun },
            { id: "dark", label: "Dark", icon: Moon },
          ].map(({ id, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <ItemIcon size={14} />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
