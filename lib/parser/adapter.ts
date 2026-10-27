import type { ParserAdapter } from "./types.ts";

export const fallbackAdapter: ParserAdapter = {
  name: "fallback",
  detect: () => true,
  excludeDirectories: () => [],
  entryPoint(path) {
    const name = path.split("/").at(-1) ?? path;
    if (/(?:^|\/)(?:__tests__|tests?|specs?)\//i.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(name)) {
      return "Reached by the test runner.";
    }
    if (/^(?:page|route|layout|template|default|loading|error|not-found|global-error|middleware|proxy)\.[cm]?[jt]sx?$/i.test(name)) {
      return "Reached by the framework convention.";
    }
    if (/^(?:next|vite|webpack|jest|vitest|eslint|postcss|tailwind|babel|tsconfig|jsconfig|package)\.[^/]+$/i.test(name) || /(?:^|\.)(?:config|rc)\.[^/]+$/i.test(name)) {
      return "Loaded as project configuration.";
    }
    return null;
  },
};

