/**
 * Pipedrive API client with token auth and safe retries for 429/5xx.
 * All Pipedrive requests go through this module.
 */
export interface PipedriveConfig {
    apiToken: string;
    domain: string;
}
export interface Deal {
    id: number;
    title?: string;
    value?: number;
    currency?: string;
    stage_id?: number;
    person_id?: number;
    org_id?: number;
    user_id?: number;
    status?: string;
    add_time?: string | number;
    update_time?: string | number;
    won_time?: string | number;
    [key: string]: unknown;
}
export interface User {
    id: number;
    name?: string;
    email?: string;
    [key: string]: unknown;
}
export interface Pipeline {
    id: number;
    name?: string;
    order_nr?: number;
    [key: string]: unknown;
}
export interface Activity {
    id: number;
    subject?: string;
    type?: string;
    due_date?: string;
    deal_id?: number;
    [key: string]: unknown;
}
export interface Note {
    id: number;
    content?: string;
    deal_id?: number;
    [key: string]: unknown;
}
export interface Product {
    id: number;
    name?: string;
    code?: string;
    unit?: string;
    tax?: number;
    active_flag?: boolean;
    prices?: {
        currency?: string;
        price?: number;
        cost?: number;
    }[];
    /** Quantity in stock – not standard in Pipedrive; may come from custom field */
    quantity?: number;
    [key: string]: unknown;
}
export interface Stage {
    id: number;
    name?: string;
    order_nr?: number;
    pipeline_id?: number;
    [key: string]: unknown;
}
export interface LeadSource {
    id: number;
    name?: string;
    [key: string]: unknown;
}
/** Product custom field metadata from GET /productFields */
export interface ProductFieldMeta {
    key?: string;
    name?: string;
    field_key?: string;
    field_name?: string;
    [key: string]: unknown;
}
export interface SearchDealsParams {
    term?: string;
    stageId?: number;
    ownerId?: number;
    olderThanDaysNoActivity?: number;
}
export interface ListActivitiesParams {
    dealId: number;
    sinceDays?: number;
}
export interface ListNotesParams {
    dealId: number;
    sinceDays?: number;
}
export interface CreateNoteParams {
    dealId: number;
    content: string;
}
export interface CreateActivityParams {
    dealId: number;
    subject: string;
    dueDate: string;
    type: string;
}
export interface UpdateDealStageParams {
    dealId: number;
    stageId: number;
}
export declare function createPipedriveClient(config: PipedriveConfig): {
    getDeal(dealId: number): Promise<Deal | null>;
    listStages(): Promise<Stage[]>;
    listUsers(): Promise<User[]>;
    listPipelines(): Promise<Pipeline[]>;
    listLeadSources(): Promise<LeadSource[]>;
    listDeals(maxItems?: number, stageId?: number): Promise<Deal[]>;
    /**
     * מחזיר עסקאות שנוספו מ־sinceMs ואילך (לפי add_time).
     * דף־דף עד שעוברים את התאריך – מתאים ל"לידים אתמול" בלי להגביל ל־10k.
     */
    listDealsAddedSince(sinceMs: number, maxItems?: number): Promise<Deal[]>;
    /** מחזיר עסקאות לפי בעלים (שימוש ב-user_id של Pipedrive v1) – מומלץ לאחוז המרה ולשאלות "עסקאות של X" */
    listDealsByOwner(ownerId: number, maxItems?: number): Promise<Deal[]>;
    listProducts(maxItems?: number): Promise<Product[]>;
    listProductFields(): Promise<ProductFieldMeta[]>;
    searchDeals(params: SearchDealsParams): Promise<Deal[]>;
    listActivities(params: ListActivitiesParams): Promise<Activity[]>;
    listNotes(params: ListNotesParams): Promise<Note[]>;
    createNote(params: CreateNoteParams): Promise<Note>;
    createActivity(params: CreateActivityParams): Promise<Activity>;
    updateDealStage(params: UpdateDealStageParams): Promise<Deal>;
    fetchDealsRaw: () => Promise<{
        status: number;
        success: boolean;
        dataType: string;
        count: number;
        baseUrl: string;
    }>;
};
export type PipedriveClient = ReturnType<typeof createPipedriveClient>;
/** Stub when no API token: read methods return empty; write methods throw. */
export declare function createStubPipedriveClient(): PipedriveClient;
//# sourceMappingURL=client.d.ts.map