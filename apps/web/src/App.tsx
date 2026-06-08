import { useEffect, useState } from "react";
import { AddAppForm } from "./components/AddAppForm";
import { AppSelector } from "./components/AppSelector";
import { ReviewList } from "./components/ReviewList";
import { WindowPicker } from "./components/WindowPicker";
import { useApps } from "./hooks/useApps";
import { useQueryParam } from "./hooks/useQueryParam";
import { useReviews } from "./hooks/useReviews";

export function App() {
  const { data: apps, isLoading: appsLoading } = useApps();
  // The `?appId=` query param is the source of truth for the selected app, so the
  // selection survives a refresh and is shareable.
  const [selectedAppId, setSelectedAppId] = useQueryParam("appId");
  const [windowHours, setWindowHours] = useState(48);
  // An app that was just registered and is awaiting its first worker sync. While set,
  // we poll its reviews and show a loader instead of the "no reviews" empty state.
  const [pendingAppId, setPendingAppId] = useState<string | undefined>();
  const awaitingFirstSync = !!selectedAppId && selectedAppId === pendingAppId;

  // If the URL names no app (or one that no longer exists), default to the first
  // available app — via `replace` so it doesn't create a spurious history entry. A
  // just-added app counts as valid even before the apps list refetches.
  useEffect(() => {
    if (!apps || apps.length === 0) return;
    const exists =
      !!selectedAppId &&
      (apps.some((a) => a.id === selectedAppId) || selectedAppId === pendingAppId);
    if (!exists) setSelectedAppId(apps[0].id, { replace: true });
  }, [apps, selectedAppId, pendingAppId, setSelectedAppId]);

  const {
    data: reviewPages,
    isLoading: reviewsLoading,
    error: reviewsError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useReviews(selectedAppId, windowHours, { pollUntilData: awaitingFirstSync });
  const reviews = reviewPages?.pages.flatMap((page) => page.items);

  // Stop waiting once the first reviews arrive for the pending app.
  useEffect(() => {
    if (awaitingFirstSync && reviews && reviews.length > 0) setPendingAppId(undefined);
  }, [awaitingFirstSync, reviews]);

  // Bound the wait so we don't poll forever for an app that genuinely has no reviews
  // in the window (the worker tick is ~10s; 30s is a comfortable ceiling).
  useEffect(() => {
    if (!pendingAppId) return;
    const timer = setTimeout(() => setPendingAppId(undefined), 30_000);
    return () => clearTimeout(timer);
  }, [pendingAppId]);

  return (
    <div>
      <header className="app-header">
        <h1>iOS App Store Reviews</h1>
        <p>Monitor recent reviews for your apps from the App Store.</p>
      </header>

      <div className="controls-bar">
        <AddAppForm
          onAdded={(id) => {
            setSelectedAppId(id);
            setPendingAppId(id);
          }}
        />

        <div className="control-group">
          <label>App</label>
          {appsLoading ? (
            <span>
              <span className="loading-spinner" aria-hidden="true" />
              Loading apps…
            </span>
          ) : (
            <AppSelector apps={apps ?? []} value={selectedAppId} onChange={setSelectedAppId} />
          )}
        </div>

        <WindowPicker value={windowHours} onChange={setWindowHours} />
      </div>

      <ReviewList
        reviews={reviews}
        isLoading={reviewsLoading}
        error={reviewsError as Error | null}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        isAwaitingFirstSync={awaitingFirstSync}
      />
    </div>
  );
}
