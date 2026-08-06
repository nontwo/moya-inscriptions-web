import { FileSearch } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title = "暂无数据",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-rice-200 rounded-full flex items-center justify-center mb-6">
        <FileSearch size={36} className="text-ink-300" />
      </div>
      <h3 className="text-lg font-medium text-ink-500 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-ink-400 max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
