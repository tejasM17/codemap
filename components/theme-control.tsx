"use client";

import { useTheme, type Theme } from "@/components/theme-provider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ThemeControl() {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      className="theme-toggle"
      aria-label="Color theme"
      value={[theme]}
      onValueChange={(value) => { if (value[0]) setTheme(value[0] as Theme); }}
      variant="outline"
      spacing={0}
    >
      <ToggleGroupItem value="system">System</ToggleGroupItem>
      <ToggleGroupItem value="light">Light</ToggleGroupItem>
      <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
    </ToggleGroup>
  );
}
