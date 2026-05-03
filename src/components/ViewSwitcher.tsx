import { Sprout, Waves, Building2 } from 'lucide-react';

export type ViewMode = 'garden' | 'river' | 'blueprint';

interface ViewSwitcherProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

const OPTIONS: Array<{ id: ViewMode; label: string; Icon: typeof Sprout }> = [
  { id: 'garden', label: 'Garden', Icon: Sprout },
  { id: 'river', label: 'River', Icon: Waves },
  { id: 'blueprint', label: 'Blueprint', Icon: Building2 },
];

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div className="ml-viewswitcher" role="tablist" aria-label="Visualization style">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          role="tab"
          aria-pressed={value === id}
          className="ml-viewswitcher__btn"
          onClick={() => onChange(id)}
        >
          <Icon size={14} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}
