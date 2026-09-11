"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
export function ThemeSelect() {
  const { theme, setTheme } = useContext(ThemeContext);
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-muted">
      Appearance
      <select
        aria-label="Appearance"
        className="rounded border border-line bg-surface px-2 py-1.5 text-xs text-foreground"
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
