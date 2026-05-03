import { TYPE_LABEL, accentForType } from '../data/mock';
import type { ProjectType } from '../data/types';

const ALL_TYPES: ProjectType[] = ['production', 'work', 'tool', 'personal', 'experiment'];

interface ProjectFilterProps {
  selected: ProjectType[];
  onChange: (types: ProjectType[]) => void;
}

export function ProjectFilter({ selected, onChange }: ProjectFilterProps) {
  const all = selected.length === 0;
  function toggle(t: ProjectType) {
    if (selected.includes(t)) {
      onChange(selected.filter((x) => x !== t));
    } else {
      onChange([...selected, t]);
    }
  }
  return (
    <div className="ml-chips" role="group" aria-label="Filter by project type">
      <button
        className="ml-chip"
        aria-pressed={all}
        onClick={() => onChange([])}
      >
        All
      </button>
      {ALL_TYPES.map((t) => {
        const active = selected.includes(t);
        return (
          <button
            key={t}
            className="ml-chip"
            aria-pressed={active}
            onClick={() => toggle(t)}
          >
            <span className="ml-chip__dot" style={{ background: accentForType(t) }} aria-hidden />
            {TYPE_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}
