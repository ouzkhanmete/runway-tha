import { useState } from "react";
import { useRegisterApp } from "../hooks/useRegisterApp";

interface AddAppFormProps {
  /** Called with the registered app's id after a successful add. */
  onAdded?: (appId: string) => void;
}

export function AddAppForm({ onAdded }: AddAppFormProps) {
  const [appId, setAppId] = useState("");
  const { mutate, isPending, error, reset } = useRegisterApp();

  return (
    <div className="control-group">
      <label htmlFor="add-app-input">Add App</label>
      <form
        className={error ? "add-app-form error" : "add-app-form"}
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = appId.trim();
          if (!trimmed) return;
          mutate(
            { appId: trimmed },
            {
              onSuccess: (app) => {
                setAppId("");
                onAdded?.(app.id);
              },
            },
          );
        }}
      >
        <input
          id="add-app-input"
          type="text"
          value={appId}
          onChange={(e) => {
            // Clear any previous mutation error so the form un-reds as the user retypes.
            if (error) reset();
            setAppId(e.target.value);
          }}
          placeholder="App Store ID (numeric)"
          aria-label="App Store numeric ID"
          disabled={isPending}
          pattern="\d+"
          title="Numeric App Store ID"
          className={error ? "add-app-input error" : "add-app-input"}
          aria-invalid={error ? true : undefined}
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
