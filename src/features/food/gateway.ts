// Pure helpers for the Blocks Data Gateway contract, kept free of the SDK so
// they can be unit-tested.

type GatewayResponse = { errors?: Array<{ message?: string }> | null };

// The gateway can answer HTTP 200 with a GraphQL `errors` array. Without this
// check a failed query reads as "no rows" and a failed mutation as success.
export function assertOk(response: unknown): void {
  const errors = (response as GatewayResponse | undefined)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(errors.map((entry) => entry?.message).filter(Boolean).join("; ") || "The data gateway returned an error.");
  }
}

// Wraps every helper on a collection so no call can skip the check above.
export function guard<C extends object>(collection: C): C {
  const wrapped: Record<string, unknown> = {};
  for (const [name, method] of Object.entries(collection)) {
    wrapped[name] = async (...args: unknown[]) => {
      const response = await (method as (...inner: unknown[]) => Promise<unknown>)(...args);
      assertOk(response);
      return response;
    };
  }
  return wrapped as C;
}


// Insert responses are shaped by the generated mutation, so look for the new
// record's id wherever it landed instead of assuming a path.
export function extractId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if ((key === "ItemId" || key === "itemId") && typeof entry === "string") return entry;
  }
  for (const entry of Object.values(value)) {
    const found = extractId(entry);
    if (found) return found;
  }
  return undefined;
}

// The gateway reports `hasNextPage` for every list, so page on that instead of
// guessing from the page length (which breaks if the server caps page size).
export function readPage<T>(response: unknown): { hasNext: boolean; items: T[] } {
  const data = (response as { data?: unknown } | undefined)?.data ?? response;
  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      const page = value as { hasNextPage?: unknown; items?: unknown } | null;
      if (page && Array.isArray(page.items)) return { hasNext: page.hasNextPage === true, items: page.items as T[] };
    }
  }
  return { hasNext: false, items: [] };
}

// Pages through a collection so portal totals are not silently capped at one page.
export async function listAll<T>(
  list: (options: { pageNo: number; pageSize: number; filter?: Record<string, unknown> }) => Promise<unknown>,
  filter?: Record<string, unknown>
): Promise<T[]> {
  const all: T[] = [];
  for (let pageNo = 1; pageNo <= 100; pageNo += 1) {
    const { hasNext, items } = readPage<T>(await list({ filter, pageNo, pageSize: 100 }));
    all.push(...items);
    if (!hasNext || items.length === 0) break;
  }
  return all;
}


// How many records a mutation touched, wherever the generated operation put
// `totalImpactedData`. Undefined when the response does not say.
export function impactedCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "totalImpactedData" && typeof entry === "number") return entry;
  }
  for (const entry of Object.values(value)) {
    const found = impactedCount(entry);
    if (found !== undefined) return found;
  }
  return undefined;
}
