import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Db } from "../db/index.js";

export async function healthRoutes(fastify: FastifyInstance, deps: { db: Db }) {
  fastify.get("/health", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      await deps.db.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", db: "connected" });
    } catch (e) {
      return reply.status(503).send({
        status: "error",
        db: "disconnected",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
