import type { FastifyInstance } from "fastify";
import type { Db } from "../db/index.js";
import type { PipedriveClient } from "../pipedrive/client.js";
export declare function confirmRoutes(fastify: FastifyInstance, deps: {
    db: Db;
    pipedrive: PipedriveClient;
}): Promise<void>;
//# sourceMappingURL=confirm.d.ts.map