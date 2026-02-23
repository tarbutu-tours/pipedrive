import { describe, it, expect, vi } from "vitest";
import { executeAction, isAllowlistedAction, ALLOWLIST, ACTION_METADATA, validateActionInput, } from "./index.js";
const mockPipedrive = {
    getDeal: vi.fn(),
    searchDeals: vi.fn(),
    listActivities: vi.fn(),
    listNotes: vi.fn(),
    createNote: vi.fn(),
    createActivity: vi.fn(),
    updateDealStage: vi.fn(),
};
function ctx(confirmedId) {
    return {
        pipedrive: mockPipedrive,
        confirmedActionRequestId: confirmedId,
    };
}
describe("allowlist", () => {
    it("rejects unknown actions", () => {
        expect(isAllowlistedAction("unknown_action")).toBe(false);
        expect(isAllowlistedAction("create_note")).toBe(true);
        expect(ALLOWLIST).toContain("create_note");
        expect(ALLOWLIST).toContain("summarize_deal");
    });
    it("executeAction returns error for unknown action", async () => {
        const result = await executeAction(ctx(), "unknown_action", {});
        expect(result.ok).toBe(false);
        if (!result.ok)
            expect(result.error).toContain("Unknown action");
    });
    it("validateActionInput rejects unknown action", () => {
        const v = validateActionInput("invalid", {});
        expect(v.success).toBe(false);
        if (!v.success)
            expect(v.error).toContain("Unknown action");
    });
});
describe("write actions require confirmation", () => {
    it("create_note fails without confirmedActionRequestId", async () => {
        const result = await executeAction(ctx(), "create_note", {
            dealId: 1,
            content: "test",
        });
        expect(result.ok).toBe(false);
        if (!result.ok)
            expect(result.error).toContain("confirmation");
    });
    it("create_activity fails without confirmedActionRequestId", async () => {
        const result = await executeAction(ctx(), "create_activity", {
            dealId: 1,
            subject: "Call",
            dueDate: "2025-12-01",
            type: "call",
        });
        expect(result.ok).toBe(false);
        if (!result.ok)
            expect(result.error).toContain("confirmation");
    });
    it("move_stage fails without confirmedActionRequestId", async () => {
        const result = await executeAction(ctx(), "move_stage", {
            dealId: 1,
            stageId: 2,
        });
        expect(result.ok).toBe(false);
        if (!result.ok)
            expect(result.error).toContain("confirmation");
    });
    it("write actions have requiresConfirmation in metadata", () => {
        expect(ACTION_METADATA.create_note.requiresConfirmation).toBe(true);
        expect(ACTION_METADATA.create_activity.requiresConfirmation).toBe(true);
        expect(ACTION_METADATA.move_stage.requiresConfirmation).toBe(true);
        expect(ACTION_METADATA.summarize_deal.requiresConfirmation).toBe(false);
    });
});
describe("read-only actions run without confirmation", () => {
    it("summarize_deal runs without confirmedActionRequestId", async () => {
        mockPipedrive.getDeal.mockResolvedValue({ id: 1, title: "Deal" });
        mockPipedrive.listActivities.mockResolvedValue([]);
        mockPipedrive.listNotes.mockResolvedValue([]);
        const result = await executeAction(ctx(), "summarize_deal", { dealId: 1 });
        expect(result.ok).toBe(true);
    });
});
describe("validateActionInput", () => {
    it("validates create_note input", () => {
        expect(validateActionInput("create_note", { dealId: 1, content: "x" }).success).toBe(true);
        expect(validateActionInput("create_note", { dealId: 0, content: "x" }).success).toBe(false);
        expect(validateActionInput("create_note", { dealId: 1 }).success).toBe(false);
    });
    it("validates move_stage input", () => {
        expect(validateActionInput("move_stage", { dealId: 1, stageId: 2 }).success).toBe(true);
        expect(validateActionInput("move_stage", { dealId: 1 }).success).toBe(false);
    });
});
//# sourceMappingURL=index.test.js.map