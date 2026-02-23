import { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

export function createDb(log?: Logger): PrismaClient {
  const prisma = new PrismaClient({
    log: log
      ? [
          { emit: "event", level: "query" },
          { emit: "event", level: "error" },
          { emit: "event", level: "warn" },
        ]
      : undefined,
  });
  if (log) {
    (prisma as unknown as { $on: (e: string, cb: (args: unknown) => void) => void }).$on(
      "query",
      (e: unknown) => log.debug(e, "prisma query")
    );
  }
  return prisma;
}

export type Db = PrismaClient;
