import { fallbackAdapter } from "./adapter.ts";
import { nestAdapter } from "./adapters/nest.ts";
import { nextAdapter } from "./adapters/next.ts";
import { reactAdapter } from "./adapters/react.ts";

export const parserAdapters = [nextAdapter, nestAdapter, reactAdapter, fallbackAdapter] as const;
