"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
type Theme = "system" | "light" | "dark";
const KEY = "grill-me-theme";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (value: Theme) => void;
}>({ theme: "system", setTheme: () => {} });
export const themeScript =
  "(function(){try{var t=localStorage.getItem('grill-me-theme')||'system';document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()";
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      let saved: Theme = "system";
      try {
        const value = localStorage.getItem(KEY);
        if (value === "dark" || value === "light") saved = value;
      } catch {
        /* Storage can be unavailable. */
      }
      updateTheme(saved);
      document.documentElement.dataset.theme =
        saved === "system" ? (media.matches ? "dark" : "light") : saved;
    }
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  function setTheme(value: Theme) {
    updateTheme(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* The current page still changes theme. */
    }
    document.documentElement.dataset.theme =
      value === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : value;
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useContext(ThemeContext);
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
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
            { id: "system", label: "System", icon: Monitor },
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
