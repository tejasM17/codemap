import type { ParserAdapter } from "./types.ts";

export const fallbackAdapter: ParserAdapter = {
  name: "fallback",
  detect: () => true,
  excludeDirectories: () => [],
};

