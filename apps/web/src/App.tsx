import { useEffect, useState } from "react";
import { useApps } from "./hooks/useApps";
import { useReviews } from "./hooks/useReviews";
import { AddAppForm } from "./components/AddAppForm";
import { AppSelector } from "./components/AppSelector";
import { WindowPicker } from "./components/WindowPicker";
import { ReviewList } from "./components/ReviewList";

export function App() {
  const { data: apps, isLoading: appsLoading } = useApps();
  const [selectedAppId, setSelectedAppId] = useState<string | undefined>();
  const [windowHours, setWindowHours] = useState(48);

  // Default to the first app once apps load
  useEffect(() => {
    if (!selectedAppId && apps && apps.length > 0) {
      setSelectedAppId(apps[0].id);
    }
  }, [apps, selectedAppId]);

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
            <AppSelector
              apps={apps ?? []}
              value={selectedAppId}
              onChange={setSelectedAppId}
            />
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
