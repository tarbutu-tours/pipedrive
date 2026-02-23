import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Db } from "../db/index.js";

export async function webhookRoutes(fastify: FastifyInstance, deps: { db: Db }) {
  fastify.post(
    "/webhooks/pipedrive",
    async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const eventType =
        (req.headers["x-pipedrive-event"] as string) ??
        (req.body as { meta?: { event?: string } })?.meta?.event ??
        "unknown";
      const payload = req.body ?? {};

      await deps.db.webhookEvent.create({
        data: {
          eventType: String(eventType),
          payloadJson: payload as object,
          status: "pending",
        },
      });

      return reply.status(200).send({ received: true });
    }
  );
}
