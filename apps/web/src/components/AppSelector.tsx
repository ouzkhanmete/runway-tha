import type { AppDto } from "@packages/shared/index";

interface AppSelectorProps {
  apps: AppDto[];
  value: string | undefined;
  onChange: (appId: string) => void;
}

export function AppSelector({ apps, value, onChange }: AppSelectorProps) {
  if (apps.length === 0) {
    return (
      <div className="app-selector">
        <select disabled>
          <option>No apps registered yet</option>
        </select>
      </div>
    );
  }

  return (
    <div className="app-selector">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select app"
      >
        {apps.map((app) => (
          <option key={app.id} value={app.id}>
            {app.name ?? app.id} ({app.country.toUpperCase()}){app.claimedAt ? " · syncing…" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
