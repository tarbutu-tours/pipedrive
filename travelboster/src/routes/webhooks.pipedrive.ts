/**
 * POST /webhooks/pipedrive
 * Receives Pipedrive webhooks (deal update). Fetches full deal + participants and runs orchestrator.
 */

import { Router, Request, Response } from 'express';
import { runForDeal } from '../services/agentOrchestrator';

const router = Router();

/** Extract deal id from webhook body (v1 or v2 style). */
function getDealIdFromBody(body: Record<string, unknown>): number | null {
  const meta = body.meta as Record<string, unknown> | undefined;
  const data = body.data as Record<string, unknown> | undefined;
  const entityId = meta?.entity_id != null ? Number(meta.entity_id) : NaN;
  const dataId = data?.id != null ? Number(data.id) : NaN;
  const dealId = body.deal_id != null ? Number(body.deal_id) : NaN;
  const id = Number.isFinite(entityId) ? entityId : Number.isFinite(dataId) ? dataId : dealId;
  return Number.isFinite(id) ? id : null;
}

router.post('/', async (req: Request, res: Response) => {
  // Respond quickly; process async
  res.status(202).json({ received: true });

  const dealId = getDealIdFromBody(req.body as Record<string, unknown>);
  if (dealId == null) {
    return;
  }
  const meta = req.body?.meta as Record<string, unknown> | undefined;
  const entity = meta?.entity ?? req.body?.entity;
  if (entity && entity !== 'deal') {
    return;
  }
  try {
    await runForDeal(dealId);
  } catch (err) {
    console.error('Orchestrator error for deal', dealId, err);
  }
});

export default router;
