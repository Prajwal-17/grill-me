"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
type Theme = "light" | "dark";
const KEY = "grill-me-theme";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (value: Theme) => void;
}>({ theme: "dark", setTheme: () => {} });
export const themeScript =
  "(function(){var t='dark';try{t=localStorage.getItem('grill-me-theme')==='light'?'light':'dark';localStorage.setItem('grill-me-theme',t)}catch(e){}document.documentElement.dataset.theme=t})()";
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("dark");
  useEffect(() => {
    function sync() {
      let saved: Theme = "dark";
      try {
        const value = localStorage.getItem(KEY);
        if (value === "light") saved = "light";
        if (value !== saved) localStorage.setItem(KEY, saved);
      } catch {
        /* Storage can be unavailable. */
      }
      updateTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
    sync();
    window.addEventListener("storage", sync);
    return () => {
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
    document.documentElement.dataset.theme = value;
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useContext(ThemeContext);
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
