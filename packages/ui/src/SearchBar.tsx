import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, onSubmit, placeholder, className = '' }: SearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className={`relative ${className}`}>
      <div className="relative">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '搜索碑刻名称、地区、朝代...（支持拼音）'}
          className="w-full pl-12 pr-12 py-3.5 bg-white border-2 border-rice-300 rounded-xl
                     text-ink-600 placeholder:text-ink-300
                     focus:border-vermilion-500 focus:ring-4 focus:ring-vermilion-100
                     transition-all duration-200 outline-none text-base"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500 cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {value.trim() && (
        <button
          type="submit"
          className="mt-3 w-full py-3 bg-vermilion-500 text-white rounded-xl font-medium
                     hover:bg-vermilion-600 transition-colors cursor-pointer"
        >
          搜索
        </button>
      )}
    </form>
  );
}
