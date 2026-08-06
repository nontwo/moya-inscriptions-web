interface FilterTagProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

export function FilterTag({ label, active, count, onClick }: FilterTagProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                  transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-vermilion-500 text-white shadow-md shadow-vermilion-200"
                      : "bg-white text-ink-500 border border-rice-300 hover:border-vermilion-300 hover:text-vermilion-500"
                  }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full ${
            active ? "bg-white/20" : "bg-rice-100"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface FilterGroupProps {
  title: string;
  children: React.ReactNode;
}

export function FilterGroup({ title, children }: FilterGroupProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-ink-500">{title}</h4>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
