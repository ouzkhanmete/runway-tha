import {
  ApiErrorSchema,
  type AppDto,
  AppDtoSchema,
  type ReviewsPageDto,
  ReviewsPageDtoSchema,
} from "@packages/shared/index";

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
    getApps: async (): Promise<AppDto[]> => AppDtoSchema.array().parse(await req("/api/apps")),

    registerApp: async (appId: string, country?: string): Promise<AppDto> =>
      AppDtoSchema.parse(
        await req("/api/apps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appId, country }),
        }),
      ),

    getReviews: async (
      appId: string,
      windowHours: number,
      cursor?: string,
    ): Promise<ReviewsPageDto> => {
      const params = new URLSearchParams({ windowHours: String(windowHours) });
      if (cursor) params.set("cursor", cursor);
      return ReviewsPageDtoSchema.parse(
        await req(`/api/apps/${appId}/reviews?${params.toString()}`),
      );
    },
  };
}

export const apiClient = createApiClient();
export type ApiClient = ReturnType<typeof createApiClient>;
