/**
 * Paper (default) and Conservation Vault (dark) theme provider persisted to localStorage.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type JSX,
  type ReactNode,
} from "react";

export type SightlineTheme = "paper" | "dark";

export interface ThemeContextValue {
  theme: SightlineTheme;
  setTheme: (next: SightlineTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "sightline-theme";

function resolveInitialTheme(defaultTheme?: SightlineTheme): SightlineTheme {
  if (typeof window === "undefined") {
    return defaultTheme ?? "paper";
  }

  // 1. URL search param takes highest precedence
  try {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get("theme");
    if (themeParam === "paper" || themeParam === "dark") {
      return themeParam;
    }
  } catch {
    // Ignore URL parse error
  }

  // 2. Local storage
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "paper" || stored === "dark") {
      return stored;
    }
  } catch {
    // Ignore storage error
  }

  // 3. Explicit default parameter or fallback to paper
  if (defaultTheme) return defaultTheme;

  // 4. Default to paper (the video and museum elevation theme)
  return "paper";
}

export function ThemeProvider(props: {
  children: ReactNode;
  defaultTheme?: SightlineTheme;
}): JSX.Element {
  const [theme, setThemeState] = useState<SightlineTheme>(() =>
    resolveInitialTheme(props.defaultTheme)
  );

  const setTheme = useCallback((next: SightlineTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage error
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "paper" ? "dark" : "paper");
  }, [theme, setTheme]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
