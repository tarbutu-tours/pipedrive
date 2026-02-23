import type { FastifyInstance } from "fastify";
import type { Db } from "../db/index.js";
import type { PipedriveClient } from "../pipedrive/client.js";
export declare function chatRoutes(fastify: FastifyInstance, deps: {
    db: Db;
    pipedrive: PipedriveClient;
}): Promise<void>;
//# sourceMappingURL=chat.d.ts.map