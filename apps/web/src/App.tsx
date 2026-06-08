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

  // If the URL names no app (or one that no longer exists), default to the first
  // available app — via `replace` so it doesn't create a spurious history entry.
  useEffect(() => {
    if (!apps || apps.length === 0) return;
    const exists = selectedAppId && apps.some((a) => a.id === selectedAppId);
    if (!exists) setSelectedAppId(apps[0].id, { replace: true });
  }, [apps, selectedAppId, setSelectedAppId]);

  const {
    data: reviews,
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useReviews(selectedAppId, windowHours);

  return (
    <div>
      <header className="app-header">
        <h1>iOS App Store Reviews</h1>
        <p>Monitor recent reviews for your apps from the App Store.</p>
      </header>

      <div className="controls-bar">
        <AddAppForm />

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
      />
    </div>
  );
}
