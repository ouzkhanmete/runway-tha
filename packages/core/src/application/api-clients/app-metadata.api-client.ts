/**
 * Resolves app metadata from the App Store by id. Used at registration time to
 * (a) validate the app actually exists and (b) fetch its display name (the
 * customer-reviews RSS feed carries neither).
 */
export type AppLookup = { found: true; name: string | null } | { found: false };

export interface AppMetadataClient {
  /** Look up an app by id. `found:false` = it doesn't exist on the App Store.
   *  Throws on transient errors (network / non-2xx) so callers can distinguish "absent" from "couldn't check". */
  lookup(appId: string, country: string): Promise<AppLookup>;
}
