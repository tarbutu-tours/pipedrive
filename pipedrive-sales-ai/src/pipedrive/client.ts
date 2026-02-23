/**
 * Pipedrive API client with token auth and safe retries for 429/5xx.
 * All Pipedrive requests go through this module.
 */

const DEFAULT_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

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
  prices?: { currency?: string; price?: number; cost?: number }[];
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  const delay = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, attempt),
    MAX_BACKOFF_MS
  );
  return delay + Math.random() * 500;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = DEFAULT_RETRIES
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    lastResponse = res;
    if (res.ok || !isRetryableStatus(res.status)) return res;
    if (attempt < retries) {
      const delay = backoff(attempt);
      await sleep(delay);
    }
  }
  return lastResponse!;
}

function normalizeBaseUrl(domain: string): string {
  const d = (domain || "").replace(/\/$/, "").trim().toLowerCase();
  if (d.startsWith("http") && d.includes("api.pipedrive.com")) {
    const match = (domain || "").match(/^(https?:\/\/[^/]+)/i);
    return match ? match[1] : "https://api.pipedrive.com";
  }
  return "https://api.pipedrive.com";
}

export function createPipedriveClient(config: PipedriveConfig) {
  const baseUrl = normalizeBaseUrl(config.domain);
  const token = (config.apiToken || "").trim();
  const apiPrefix = baseUrl.includes("api.pipedrive.com") ? "/v1" : "/api/v1";

  function toDealsArray(data: unknown): Deal[] {
    if (Array.isArray(data)) return data as Deal[];
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.items)) return o.items as Deal[];
      if (Array.isArray(o.data)) return o.data as Deal[];
    }
    return [];
  }

  /** מחזיר add_time בעסקה במילישניות (מנסה add_time, creation_time, create_time) */
  function getDealAddTimeMs(d: Deal): number {
    const raw = d as Record<string, unknown>;
    const t = raw.add_time ?? raw.creation_time ?? raw.create_time;
    if (t == null) return 0;
    if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
    return new Date(String(t)).getTime();
  }
  function toProductsArray(data: unknown): Product[] {
    if (Array.isArray(data)) return data as Product[];
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.items)) return o.items as Product[];
      if (Array.isArray(o.data)) return o.data as Product[];
    }
    return [];
  }
  function toProductFieldsArray(data: unknown): ProductFieldMeta[] {
    if (Array.isArray(data)) return data as ProductFieldMeta[];
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.data)) return o.data as ProductFieldMeta[];
      if (Array.isArray(o.items)) return o.items as ProductFieldMeta[];
    }
    return [];
  }
  function toUsersArray(data: unknown): User[] {
    if (Array.isArray(data)) return data as User[];
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.items)) return o.items as User[];
      if (Array.isArray(o.data)) return o.data as User[];
    }
    return [];
  }
  function toPipelinesArray(data: unknown): Pipeline[] {
    if (Array.isArray(data)) return data as Pipeline[];
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.items)) return o.items as Pipeline[];
      if (Array.isArray(o.data)) return o.data as Pipeline[];
    }
    return [];
  }
  function toLeadSourcesArray(data: unknown): LeadSource[] {
    if (Array.isArray(data)) return data as LeadSource[];
    if (data && typeof data === "object") {
      const o = data as Record<string, unknown>;
      if (Array.isArray(o.data)) return o.data as LeadSource[];
      if (Array.isArray(o.items)) return o.items as LeadSource[];
    }
    return [];
  }

  async function request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; success?: boolean; additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } } }> {
    const url = `${baseUrl}${apiPrefix}${path}${path.includes("?") ? "&" : "?"}api_token=${encodeURIComponent(token)}`;
    const res = await fetchWithRetry(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const json = (await res.json()) as { data?: T; success?: boolean; additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } } };
    if (!res.ok) {
      throw new Error(
        `Pipedrive API error ${res.status}: ${JSON.stringify(json)}`
      );
    }
    if (json.success === false && "error" in json) {
      throw new Error(`Pipedrive: ${(json as { error?: string }).error ?? "Unknown error"}`);
    }
    return json;
  }

  /** לאבחון: מחזיר תגובה גולמית (בלי טוקן) */
  async function fetchDealsRaw(): Promise<{ status: number; success: boolean; dataType: string; count: number; baseUrl: string }> {
    const url = `${baseUrl}${apiPrefix}/deals?start=0&limit=10&api_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    let count = 0;
    let dataType = "null";
    if (json.data != null) {
      if (Array.isArray(json.data)) {
        count = json.data.length;
        dataType = "array";
      } else if (typeof json.data === "object") {
        dataType = "object";
        const o = json.data as Record<string, unknown>;
        if (Array.isArray(o.items)) count = (o.items as unknown[]).length;
        else if (Array.isArray(o.data)) count = (o.data as unknown[]).length;
      }
    }
    return {
      status: res.status,
      success: json.success === true,
      dataType,
      count,
      baseUrl: baseUrl.replace(/api_token=[^&]+/, "api_token=***"),
    };
  }

  return {
    async getDeal(dealId: number): Promise<Deal | null> {
      const { data } = await request<Deal>(`/deals/${dealId}`);
      return data ?? null;
    },

    async listStages(): Promise<Stage[]> {
      const res = await request<unknown>("/stages");
      const data = res.data;
      if (Array.isArray(data)) return data as Stage[];
      if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items))
        return (data as { items: Stage[] }).items;
      return [];
    },

    async listUsers(): Promise<User[]> {
      const res = await request<unknown>("/users");
      return toUsersArray(res.data);
    },

    async listPipelines(): Promise<Pipeline[]> {
      const res = await request<unknown>("/pipelines");
      return toPipelinesArray(res.data);
    },

    async listLeadSources(): Promise<LeadSource[]> {
      try {
        const res = await request<unknown>("/leadSources");
        return toLeadSourcesArray(res.data);
      } catch {
        return [];
      }
    },

    async listDeals(maxItems = 10000, stageId?: number): Promise<Deal[]> {
      const limit = Math.min(500, maxItems);
      const out: Deal[] = [];
      let start = 0;
      let hasMore = true;
      const stageParam = stageId != null ? `&stage_id=${stageId}` : "";
      while (hasMore && out.length < maxItems) {
        const res = await request<unknown>(`/deals?start=${start}&limit=${limit}&sort_by=add_time&sort_direction=desc${stageParam}`);
        const arr = toDealsArray(res.data);
        out.push(...arr);
        const pagination = res.additional_data?.pagination;
        hasMore = (pagination?.more_items_in_collection === true) && arr.length === limit;
        const nextStart = pagination?.next_start;
        start = nextStart != null ? nextStart : start + arr.length;
        if (arr.length < limit) break;
      }
      return out.slice(0, maxItems);
    },

    /**
     * מחזיר עסקאות שנוספו מ־sinceMs ואילך (לפי add_time).
     * דף־דף עד שעוברים את התאריך – מתאים ל"לידים אתמול" בלי להגביל ל־10k.
     */
    async listDealsAddedSince(sinceMs: number, maxItems = 50000): Promise<Deal[]> {
      const limit = 500;
      const out: Deal[] = [];
      let start = 0;
      let hasMore = true;
      while (hasMore && out.length < maxItems) {
        const res = await request<unknown>(`/deals?start=${start}&limit=${limit}&sort_by=add_time&sort_direction=desc`);
        const arr = toDealsArray(res.data);
        let foundOlder = false;
        let allMissingAddTime = arr.length > 0;
        for (const d of arr) {
          const t = getDealAddTimeMs(d);
          if (t > 0) allMissingAddTime = false;
          if (t > 0 && t < sinceMs) {
            foundOlder = true;
            break;
          }
          if (t >= sinceMs) out.push(d);
        }
        if (allMissingAddTime && arr.length > 0) break;
        if (foundOlder) hasMore = false;
        if (arr.length < limit) break;
        const nextStart = res.additional_data?.pagination?.next_start;
        start = nextStart != null ? nextStart : start + arr.length;
        if (!hasMore) break;
      }
      return out;
    },

    /** מחזיר עסקאות לפי בעלים (שימוש ב-user_id של Pipedrive v1) – מומלץ לאחוז המרה ולשאלות "עסקאות של X" */
    async listDealsByOwner(ownerId: number, maxItems = 10000): Promise<Deal[]> {
      const limit = Math.min(500, maxItems);
      const out: Deal[] = [];
      let start = 0;
      let hasMore = true;
      const ownerParam = `&user_id=${ownerId}`;
      while (hasMore && out.length < maxItems) {
        const res = await request<unknown>(`/deals?start=${start}&limit=${limit}&sort_by=add_time&sort_direction=desc${ownerParam}`);
        const arr = toDealsArray(res.data);
        out.push(...arr);
        const pagination = res.additional_data?.pagination;
        hasMore = (pagination?.more_items_in_collection === true) && arr.length === limit;
        const nextStart = pagination?.next_start;
        start = nextStart != null ? nextStart : start + arr.length;
        if (arr.length < limit) break;
      }
      return out.slice(0, maxItems);
    },

    async listProducts(maxItems = 2000): Promise<Product[]> {
      const limit = Math.min(500, maxItems);
      const out: Product[] = [];
      let start = 0;
      let hasMore = true;
      while (hasMore && out.length < maxItems) {
        const res = await request<unknown>(`/products?start=${start}&limit=${limit}`);
        const arr = toProductsArray(res.data);
        out.push(...arr);
        hasMore = (res.additional_data?.pagination?.more_items_in_collection === true) && arr.length === limit;
        start += arr.length;
        if (arr.length < limit) break;
      }
      return out.slice(0, maxItems);
    },

    async listProductFields(): Promise<ProductFieldMeta[]> {
      try {
        const res = await request<unknown>("/productFields");
        return toProductFieldsArray(res.data);
      } catch {
        return [];
      }
    },

    async searchDeals(params: SearchDealsParams): Promise<Deal[]> {
      const search: string[] = [];
      if (params.term) search.push(`term=${encodeURIComponent(params.term)}`);
      if (params.stageId != null) search.push(`stage_id=${params.stageId}`);
      if (params.ownerId != null) search.push(`user_id=${params.ownerId}`);
      const qs = search.length ? `&${search.join("&")}` : "";
      const res = await request<Deal[] | { items?: Deal[] }>(`/deals/search?exact_match=false${qs}`);
      const data = res.data;
      let deals: Deal[] = Array.isArray(data)
        ? data
        : (data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: Deal[] }).items))
          ? (data as { items: Deal[] }).items
          : [];
      if (params.olderThanDaysNoActivity != null && params.olderThanDaysNoActivity > 0) {
        // Count only open deals as "exceptions" – won/lost must not be included
        deals = deals.filter((d) => (d.status ?? "open") === "open");
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - params.olderThanDaysNoActivity);
        const cutoffTs = cutoff.getTime() / 1000;
        const maxToCheck = 300;
        const withActivity = await Promise.all(
          deals.slice(0, maxToCheck).map(async (d) => {
            const acts = await this.listActivities({ dealId: d.id, sinceDays: params.olderThanDaysNoActivity! });
            const lastActivity = acts.length
              ? Math.max(...acts.map((a) => ((a as { done_time?: number }).done_time ? Number((a as { done_time?: number }).done_time) : 0)))
              : 0;
            return { deal: d, lastActivity };
          })
        );
        deals = withActivity
          .filter((x) => x.lastActivity < cutoffTs || x.lastActivity === 0)
          .map((x) => x.deal);
      }
      return deals;
    },

    async listActivities(params: ListActivitiesParams): Promise<Activity[]> {
      const { dealId, sinceDays = 30 } = params;
      const since = sinceDays > 0
        ? `&since=${new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`
        : "";
      const res = await request<unknown>(`/activities?deal_id=${dealId}${since}&limit=100`);
      const data = res.data;
      if (Array.isArray(data)) return data as Activity[];
      if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items))
        return (data as { items: Activity[] }).items;
      return [];
    },

    async listNotes(params: ListNotesParams): Promise<Note[]> {
      const { dealId, sinceDays = 30 } = params;
      const { data } = await request<{ items?: Note[] }>(`/notes?deal_id=${dealId}&limit=100`);
      const items = data?.items ?? (Array.isArray(data) ? data : []);
      const notes = Array.isArray(items) ? items : [];
      if (sinceDays <= 0) return notes;
      const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
      return notes.filter((n) => {
        const t = (n as { add_time?: string }).add_time;
        return t ? new Date(t).getTime() >= cutoff : true;
      });
    },

    async createNote(params: CreateNoteParams): Promise<Note> {
      const { data } = await request<Note>("/notes", {
        method: "POST",
        body: JSON.stringify({
          deal_id: params.dealId,
          content: params.content,
        }),
      });
      if (!data) throw new Error("Pipedrive createNote returned no data");
      return data;
    },

    async createActivity(params: CreateActivityParams): Promise<Activity> {
      const { data } = await request<Activity>("/activities", {
        method: "POST",
        body: JSON.stringify({
          deal_id: params.dealId,
          subject: params.subject,
          due_date: params.dueDate,
          type: params.type,
        }),
      });
      if (!data) throw new Error("Pipedrive createActivity returned no data");
      return data;
    },

    async updateDealStage(params: UpdateDealStageParams): Promise<Deal> {
      const { data } = await request<Deal>(`/deals/${params.dealId}`, {
        method: "PUT",
        body: JSON.stringify({ stage_id: params.stageId }),
      });
      if (!data) throw new Error("Pipedrive updateDealStage returned no data");
      return data;
    },

    fetchDealsRaw,
  };
}

export type PipedriveClient = ReturnType<typeof createPipedriveClient>;

/** Stub when no API token: read methods return empty; write methods throw. */
export function createStubPipedriveClient(): PipedriveClient {
  return {
    getDeal: async () => null,
    listStages: async () => [],
    listUsers: async () => [],
    listPipelines: async () => [],
    listLeadSources: async () => [],
    listDeals: async () => [],
    listDealsAddedSince: async () => [],
    listDealsByOwner: async () => [],
    listProducts: async () => [],
    listProductFields: async () => [],
    searchDeals: async () => [],
    fetchDealsRaw: async () => ({ status: 0, success: false, dataType: "stub", count: 0, baseUrl: "" }),
    listActivities: async () => [],
    listNotes: async () => [],
    createNote: async () => {
      throw new Error("Pipedrive API token not configured");
    },
    createActivity: async () => {
      throw new Error("Pipedrive API token not configured");
    },
    updateDealStage: async () => {
      throw new Error("Pipedrive API token not configured");
    },
  };
}
