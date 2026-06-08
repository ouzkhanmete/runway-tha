/**
 * Resolves app metadata (currently just the display name) by App Store id. The
 * customer-reviews RSS feed does not carry the app name, so the worker fills it
 * from here once per app.
 */
export interface AppMetadataClient {
  /** The app's display name, or null if it can't be resolved (best-effort). */
  fetchAppName(appId: string, country: string): Promise<string | null>;
}
