import { PrismaClient } from "@prisma/client";
export function createDb(log) {
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
        prisma.$on("query", (e) => log.debug(e, "prisma query"));
    }
    return prisma;
}
//# sourceMappingURL=index.js.map