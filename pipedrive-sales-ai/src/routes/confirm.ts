import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import type { PipedriveClient } from "../pipedrive/client.js";
import {
  executeAction,
  validateActionInput,
  ACTION_METADATA,
  type ActionContext,
} from "../actions/index.js";
import type { ActionType } from "../actions/schemas.js";
import { canConfirmThisRequest } from "../auth/index.js";
import type { UserRecord } from "../auth/index.js";

const confirmBody = z.object({
  actionRequestId: z.string().min(1),
  confirm: z.boolean(),
});

export async function confirmRoutes(
  fastify: FastifyInstance,
  deps: { db: Db; pipedrive: PipedriveClient }
) {
  fastify.post(
    "/api/actions/confirm",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const r = req as FastifyRequest<{ Body: unknown }> & { user: UserRecord };
      const user = r.user;
      const parsed = confirmBody.safeParse(r.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid input" });
      }

      const { actionRequestId, confirm: userConfirmed } = parsed.data;

      const actionRequest = await deps.db.actionRequest.findUnique({
        where: { id: actionRequestId },
        include: { createdBy: true },
      });

      if (!actionRequest) {
        return reply.status(404).send({ error: "Action request not found" });
      }

      if (actionRequest.status !== "pending_confirmation") {
        return reply.status(400).send({
          error: `Action request is not pending (status: ${actionRequest.status})`,
        });
      }

      if (!canConfirmThisRequest(
        user.role,
        user.id,
        actionRequest.createdByUserId
      )) {
        return reply.status(403).send({ error: "Not allowed to confirm this request" });
      }

      if (!userConfirmed) {
        await deps.db.actionRequest.update({
          where: { id: actionRequestId },
          data: { status: "cancelled" },
        });
        return reply.send({
          ok: true,
          actionRequestId,
          executed: false,
          message: "בוטל",
        });
      }

      const plan = actionRequest.planJson as { actionType?: string; input?: unknown };
      const actionType = plan?.actionType;
      if (!actionType || typeof actionType !== "string") {
        return reply.status(400).send({ error: "Invalid plan: missing actionType" });
      }

      const meta = ACTION_METADATA[actionType as ActionType];
      if (!meta) {
        return reply.status(400).send({ error: "Unknown action type" });
      }

      const validation = validateActionInput(actionType as ActionType, plan.input);
      if (!validation.success) {
        return reply.status(400).send({ error: validation.error });
      }

      const ctx: ActionContext = {
        pipedrive: deps.pipedrive,
        confirmedActionRequestId: actionRequestId,
      };

      const result = await executeAction(ctx, actionType as ActionType, validation.data);

      await deps.db.actionRequest.update({
        where: { id: actionRequestId },
        data: {
          status: result.ok ? "executed" : "failed",
          executedAt: new Date(),
          resultJson: result.ok ? (result.data as object) : { error: result.error },
        },
      });

      await deps.db.auditLog.create({
        data: {
          actionType,
          planJson: actionRequest.planJson as object,
          executedPayload: plan.input as object,
          resultJson: result.ok ? (result.data as object) : { error: result.error },
          confirmedByUserId: user.id,
          actionRequestId,
        },
      });

      return reply.send({
        ok: true,
        actionRequestId,
        executed: result.ok,
        result: result.ok ? result.data : { error: result.error },
      });
    }
  );
}
