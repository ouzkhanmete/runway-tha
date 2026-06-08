import {
  ReviewDtoSchema,
  AppDtoSchema,
  ApiErrorSchema,
  type ReviewDto,
  type AppDto,
} from "@runway/shared";

export function createApiClient(opts?: { fetch?: typeof fetch; baseUrl?: string }) {
  const f = opts?.fetch ?? fetch;
  const base = opts?.baseUrl ?? "";

  async function req(path: string, init?: RequestInit) {
    const res = await f(`${base}${path}`, init);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const e = ApiErrorSchema.safeParse(json);
      throw new Error(e.success ? e.data.error.message : `Request failed (${res.status})`);
    }
    return json;
  }

  return {
    getApps: async (): Promise<AppDto[]> =>
      AppDtoSchema.array().parse(await req("/api/apps")),

    registerApp: async (appId: string, country?: string): Promise<AppDto> =>
      AppDtoSchema.parse(
        await req("/api/apps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appId, country }),
        })
      ),

    getReviews: async (appId: string, windowHours: number): Promise<ReviewDto[]> =>
      ReviewDtoSchema.array().parse(
        await req(`/api/apps/${appId}/reviews?windowHours=${windowHours}`)
      ),
  };
}

export const apiClient = createApiClient();
export type ApiClient = ReturnType<typeof createApiClient>;
