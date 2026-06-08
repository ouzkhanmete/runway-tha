import { useState } from "react";
import { useRegisterApp } from "../hooks/useRegisterApp";

export function AddAppForm() {
  const [appId, setAppId] = useState("");
  const { mutate, isPending, error } = useRegisterApp();

  return (
    <div className="control-group">
      <label htmlFor="add-app-input">Add App</label>
      <form
        className="add-app-form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = appId.trim();
          if (!trimmed) return;
          mutate(
            { appId: trimmed },
            {
              onSuccess: () => {
                setAppId("");
              },
            },
          );
        }}
      >
        <input
          id="add-app-input"
          type="text"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="App Store ID (numeric)"
          aria-label="App Store numeric ID"
          disabled={isPending}
          pattern="\d+"
          title="Numeric App Store ID"
        />
        <button type="submit" disabled={isPending || !appId.trim()}>
          {isPending ? "Adding…" : "Add"}
        </button>
      </form>
      {error && (
        <div className="error-msg" role="alert">
          {error.message}
        </div>
      )}
    </div>
  );
}
