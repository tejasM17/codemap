"use client";

import { useTheme, type Theme } from "@/components/theme-provider";

export function ThemeControl() {
  const { theme, setTheme } = useTheme();

  return (
    <label className="theme-control">
      <span className="theme-control__icon" aria-hidden="true">◐</span>
      <span className="sr-only">Color theme</span>
      <select
        aria-label="Color theme"
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
