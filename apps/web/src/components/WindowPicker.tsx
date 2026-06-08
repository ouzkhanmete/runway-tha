const WINDOWS = [
  { label: "48h", hours: 48 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
] as const;

interface WindowPickerProps {
  value: number;
  onChange: (hours: number) => void;
}

export function WindowPicker({ value, onChange }: WindowPickerProps) {
  return (
    <div className="control-group">
      <label>Time Window</label>
      <div className="window-picker" role="group" aria-label="Select time window">
        {WINDOWS.map(({ label, hours }) => (
          <button
            key={hours}
            type="button"
            className={value === hours ? "active" : undefined}
            onClick={() => onChange(hours)}
            aria-pressed={value === hours}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
