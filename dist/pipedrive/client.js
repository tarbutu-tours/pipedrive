/**
 * Pipedrive API client with token auth and safe retries for 429/5xx.
 * All Pipedrive requests go through this module.
 */
const DEFAULT_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
function isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status < 600);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function backoff(attempt) {
    const delay = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
    return delay + Math.random() * 500;
}
async function fetchWithRetry(url, options, retries = DEFAULT_RETRIES) {
    let lastResponse = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url, options);
        lastResponse = res;
        if (res.ok || !isRetryableStatus(res.status))
            return res;
        if (attempt < retries) {
            const delay = backoff(attempt);
            await sleep(delay);
        }
    }
    return lastResponse;
}
function normalizeBaseUrl(domain) {
    const d = (domain || "").replace(/\/$/, "").trim().toLowerCase();
    if (d.startsWith("http") && d.includes("api.pipedrive.com")) {
        const match = (domain || "").match(/^(https?:\/\/[^/]+)/i);
        return match ? match[1] : "https://api.pipedrive.com";
    }
    return "https://api.pipedrive.com";
}
export function createPipedriveClient(config) {
    const baseUrl = normalizeBaseUrl(config.domain);
    const token = (config.apiToken || "").trim();
    const apiPrefix = baseUrl.includes("api.pipedrive.com") ? "/v1" : "/api/v1";
    function toDealsArray(data) {
        if (Array.isArray(data))
            return data;
        if (data && typeof data === "object") {
            const o = data;
            if (Array.isArray(o.items))
                return o.items;
            if (Array.isArray(o.data))
                return o.data;
        }
        return [];
    }
    /** מחזיר add_time בעסקה במילישניות (מנסה add_time, creation_time, create_time) */
    function getDealAddTimeMs(d) {
        const raw = d;
        const t = raw.add_time ?? raw.creation_time ?? raw.create_time;
        if (t == null)
            return 0;
        if (typeof t === "number")
            return t < 1e12 ? t * 1000 : t;
        return new Date(String(t)).getTime();
    }
    function toProductsArray(data) {
        if (Array.isArray(data))
            return data;
        if (data && typeof data === "object") {
            const o = data;
            if (Array.isArray(o.items))
                return o.items;
            if (Array.isArray(o.data))
                return o.data;
        }
        return [];
    }
    function toProductFieldsArray(data) {
        if (Array.isArray(data))
            return data;
        if (data && typeof data === "object") {
            const o = data;
            if (Array.isArray(o.data))
                return o.data;
            if (Array.isArray(o.items))
                return o.items;
        }
        return [];
    }
    function toUsersArray(data) {
        if (Array.isArray(data))
            return data;
        if (data && typeof data === "object") {
            const o = data;
            if (Array.isArray(o.items))
                return o.items;
            if (Array.isArray(o.data))
                return o.data;
        }
        return [];
    }
    function toPipelinesArray(data) {
        if (Array.isArray(data))
            return data;
        if (data && typeof data === "object") {
            const o = data;
            if (Array.isArray(o.items))
                return o.items;
            if (Array.isArray(o.data))
                return o.data;
        }
        return [];
    }
    function toLeadSourcesArray(data) {
        if (Array.isArray(data))
            return data;
        if (data && typeof data === "object") {
            const o = data;
            if (Array.isArray(o.data))
                return o.data;
            if (Array.isArray(o.items))
                return o.items;
        }
        return [];
    }
    async function request(path, options = {}) {
        const url = `${baseUrl}${apiPrefix}${path}${path.includes("?") ? "&" : "?"}api_token=${encodeURIComponent(token)}`;
        const res = await fetchWithRetry(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });
        const json = (await res.json());
        if (!res.ok) {
            throw new Error(`Pipedrive API error ${res.status}: ${JSON.stringify(json)}`);
        }
        if (json.success === false && "error" in json) {
            throw new Error(`Pipedrive: ${json.error ?? "Unknown error"}`);
        }
        return json;
    }
    /** לאבחון: מחזיר תגובה גולמית (בלי טוקן) */
    async function fetchDealsRaw() {
        const url = `${baseUrl}${apiPrefix}/deals?start=0&limit=10&api_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
        const json = (await res.json());
        let count = 0;
        let dataType = "null";
        if (json.data != null) {
            if (Array.isArray(json.data)) {
                count = json.data.length;
                dataType = "array";
            }
            else if (typeof json.data === "object") {
                dataType = "object";
                const o = json.data;
                if (Array.isArray(o.items))
                    count = o.items.length;
                else if (Array.isArray(o.data))
                    count = o.data.length;
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
        async getDeal(dealId) {
            const { data } = await request(`/deals/${dealId}`);
            return data ?? null;
        },
        async listStages() {
            const res = await request("/stages");
            const data = res.data;
            if (Array.isArray(data))
                return data;
            if (data && typeof data === "object" && Array.isArray(data.items))
                return data.items;
            return [];
        },
        async listUsers() {
            const res = await request("/users");
            return toUsersArray(res.data);
        },
        async listPipelines() {
            const res = await request("/pipelines");
            return toPipelinesArray(res.data);
        },
        async listLeadSources() {
            try {
                const res = await request("/leadSources");
                return toLeadSourcesArray(res.data);
            }
            catch {
                return [];
            }
        },
        async listDeals(maxItems = 10000, stageId) {
            const limit = Math.min(500, maxItems);
            const out = [];
            let start = 0;
            let hasMore = true;
            const stageParam = stageId != null ? `&stage_id=${stageId}` : "";
            while (hasMore && out.length < maxItems) {
                const res = await request(`/deals?start=${start}&limit=${limit}&sort_by=add_time&sort_direction=desc${stageParam}`);
                const arr = toDealsArray(res.data);
                out.push(...arr);
                const pagination = res.additional_data?.pagination;
                hasMore = (pagination?.more_items_in_collection === true) && arr.length === limit;
                const nextStart = pagination?.next_start;
                start = nextStart != null ? nextStart : start + arr.length;
                if (arr.length < limit)
                    break;
            }
            return out.slice(0, maxItems);
        },
        /**
         * מחזיר עסקאות שנוספו מ־sinceMs ואילך (לפי add_time).
         * דף־דף עד שעוברים את התאריך – מתאים ל"לידים אתמול" בלי להגביל ל־10k.
         */
        async listDealsAddedSince(sinceMs, maxItems = 50000) {
            const limit = 500;
            const out = [];
            let start = 0;
            let hasMore = true;
            while (hasMore && out.length < maxItems) {
                const res = await request(`/deals?start=${start}&limit=${limit}&sort_by=add_time&sort_direction=desc`);
                const arr = toDealsArray(res.data);
                let foundOlder = false;
                let allMissingAddTime = arr.length > 0;
                for (const d of arr) {
                    const t = getDealAddTimeMs(d);
                    if (t > 0)
                        allMissingAddTime = false;
                    if (t > 0 && t < sinceMs) {
                        foundOlder = true;
                        break;
                    }
                    if (t >= sinceMs)
                        out.push(d);
                }
                if (allMissingAddTime && arr.length > 0)
                    break;
                if (foundOlder)
                    hasMore = false;
                if (arr.length < limit)
                    break;
                const nextStart = res.additional_data?.pagination?.next_start;
                start = nextStart != null ? nextStart : start + arr.length;
                if (!hasMore)
                    break;
            }
            return out;
        },
        /** מחזיר עסקאות לפי בעלים (שימוש ב-user_id של Pipedrive v1) – מומלץ לאחוז המרה ולשאלות "עסקאות של X" */
        async listDealsByOwner(ownerId, maxItems = 10000) {
            const limit = Math.min(500, maxItems);
            const out = [];
            let start = 0;
            let hasMore = true;
            const ownerParam = `&user_id=${ownerId}`;
            while (hasMore && out.length < maxItems) {
                const res = await request(`/deals?start=${start}&limit=${limit}&sort_by=add_time&sort_direction=desc${ownerParam}`);
                const arr = toDealsArray(res.data);
                out.push(...arr);
                const pagination = res.additional_data?.pagination;
                hasMore = (pagination?.more_items_in_collection === true) && arr.length === limit;
                const nextStart = pagination?.next_start;
                start = nextStart != null ? nextStart : start + arr.length;
                if (arr.length < limit)
                    break;
            }
            return out.slice(0, maxItems);
        },
        async listProducts(maxItems = 2000) {
            const limit = Math.min(500, maxItems);
            const out = [];
            let start = 0;
            let hasMore = true;
            while (hasMore && out.length < maxItems) {
                const res = await request(`/products?start=${start}&limit=${limit}`);
                const arr = toProductsArray(res.data);
                out.push(...arr);
                hasMore = (res.additional_data?.pagination?.more_items_in_collection === true) && arr.length === limit;
                start += arr.length;
                if (arr.length < limit)
                    break;
            }
            return out.slice(0, maxItems);
        },
        async listProductFields() {
            try {
                const res = await request("/productFields");
                return toProductFieldsArray(res.data);
            }
            catch {
                return [];
            }
        },
        async searchDeals(params) {
            const search = [];
            if (params.term)
                search.push(`term=${encodeURIComponent(params.term)}`);
            if (params.stageId != null)
                search.push(`stage_id=${params.stageId}`);
            if (params.ownerId != null)
                search.push(`user_id=${params.ownerId}`);
            const qs = search.length ? `&${search.join("&")}` : "";
            const res = await request(`/deals/search?exact_match=false${qs}`);
            const data = res.data;
            let deals = Array.isArray(data)
                ? data
                : (data && typeof data === "object" && "items" in data && Array.isArray(data.items))
                    ? data.items
                    : [];
            if (params.olderThanDaysNoActivity != null && params.olderThanDaysNoActivity > 0) {
                // Count only open deals as "exceptions" – won/lost must not be included
                deals = deals.filter((d) => (d.status ?? "open") === "open");
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - params.olderThanDaysNoActivity);
                const cutoffTs = cutoff.getTime() / 1000;
                const maxToCheck = 300;
                const withActivity = await Promise.all(deals.slice(0, maxToCheck).map(async (d) => {
                    const acts = await this.listActivities({ dealId: d.id, sinceDays: params.olderThanDaysNoActivity });
                    const lastActivity = acts.length
                        ? Math.max(...acts.map((a) => (a.done_time ? Number(a.done_time) : 0)))
                        : 0;
                    return { deal: d, lastActivity };
                }));
                deals = withActivity
                    .filter((x) => x.lastActivity < cutoffTs || x.lastActivity === 0)
                    .map((x) => x.deal);
            }
            return deals;
        },
        async listActivities(params) {
            const { dealId, sinceDays = 30 } = params;
            const since = sinceDays > 0
                ? `&since=${new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`
                : "";
            const res = await request(`/activities?deal_id=${dealId}${since}&limit=100`);
            const data = res.data;
            if (Array.isArray(data))
                return data;
            if (data && typeof data === "object" && Array.isArray(data.items))
                return data.items;
            return [];
        },
        async listNotes(params) {
            const { dealId, sinceDays = 30 } = params;
            const { data } = await request(`/notes?deal_id=${dealId}&limit=100`);
            const items = data?.items ?? (Array.isArray(data) ? data : []);
            const notes = Array.isArray(items) ? items : [];
            if (sinceDays <= 0)
                return notes;
            const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
            return notes.filter((n) => {
                const t = n.add_time;
                return t ? new Date(t).getTime() >= cutoff : true;
            });
        },
        async createNote(params) {
            const { data } = await request("/notes", {
                method: "POST",
                body: JSON.stringify({
                    deal_id: params.dealId,
                    content: params.content,
                }),
            });
            if (!data)
                throw new Error("Pipedrive createNote returned no data");
            return data;
        },
        async createActivity(params) {
            const { data } = await request("/activities", {
                method: "POST",
                body: JSON.stringify({
                    deal_id: params.dealId,
                    subject: params.subject,
                    due_date: params.dueDate,
                    type: params.type,
                }),
            });
            if (!data)
                throw new Error("Pipedrive createActivity returned no data");
            return data;
        },
        async updateDealStage(params) {
            const { data } = await request(`/deals/${params.dealId}`, {
                method: "PUT",
                body: JSON.stringify({ stage_id: params.stageId }),
            });
            if (!data)
                throw new Error("Pipedrive updateDealStage returned no data");
            return data;
        },
        fetchDealsRaw,
    };
}
/** Stub when no API token: read methods return empty; write methods throw. */
export function createStubPipedriveClient() {
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
//# sourceMappingURL=client.js.map