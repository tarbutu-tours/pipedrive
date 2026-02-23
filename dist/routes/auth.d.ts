import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Db } from "../db/index.js";
import { type UserRecord } from "../auth/index.js";
export declare function ensureDefaultUser(db: Db, log: {
    warn: (o: unknown, msg?: string) => void;
}): Promise<UserRecord | null>;
export declare function authRoutes(fastify: FastifyInstance, deps: {
    db: Db;
}): Promise<void>;
export declare function verifySession(req: FastifyRequest, reply: FastifyReply, db: Db): Promise<UserRecord | null>;
//# sourceMappingURL=auth.d.ts.map