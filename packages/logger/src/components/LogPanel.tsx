import { useState, useEffect, useRef, useCallback } from 'react';
import { logCollector } from '../core/LogCollector';
import type { LogEntry, LogLevel } from '@moya/contracts';
import { X, Download, Trash2, Search, Copy, ChevronDown } from 'lucide-react';

const LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: '#C41E3A',
  WARNING: '#E65100',
  INFO: '#1565C0',
  DEBUG: '#8C8C8C',
};

const LEVEL_ORDER: LogLevel[] = ['ERROR', 'WARNING', 'INFO', 'DEBUG'];

interface LogPanelProps {
  open: boolean;
  onClose: () => void;
}

export function LogPanel({ open, onClose }: LogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = logCollector.subscribe(() => {
      updateLogs();
    });
    updateLogs();
    return unsub;
  }, [filterLevel, searchTerm]);

  const updateLogs = useCallback(() => {
    let entries = logCollector.getEntries(filterLevel || undefined);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.message.toLowerCase().includes(term) ||
          e.module.toLowerCase().includes(term) ||
          e.function.toLowerCase().includes(term)
      );
    }
    setLogs(entries);
  }, [filterLevel, searchTerm]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, logs.length]);

  const handleExportJSON = () => {
    const blob = new Blob([logCollector.exportJSON()], { type: 'application/json' });
    downloadBlob(blob, `moya-logs-${Date.now()}.json`);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    const blob = new Blob(['\uFEFF' + logCollector.exportCSV()], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `moya-logs-${Date.now()}.csv`);
    setShowExportMenu(false);
  };

  const handleClear = () => {
    logCollector.clear();
    updateLogs();
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={onClose} />

      {/* 日志面板 */}
      <div className="fixed z-50 bg-white shadow-2xl flex flex-col
                      md:top-0 md:right-0 md:w-[400px] md:h-full md:animate-slide-in-right
                      bottom-0 left-0 right-0 h-[80%] rounded-t-2xl md:rounded-none
                      animate-slide-in-up">
        {/* 头部工具栏 */}
        <div className="flex-shrink-0 border-b border-rice-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-ink-600 text-sm">
              日志面板
              <span className="text-ink-400 font-normal ml-1">({logs.length})</span>
            </h3>
            <div className="flex items-center gap-1">
              {/* 导出 */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-rice-100 rounded cursor-pointer"
                  title="导出日志"
                >
                  <Download size={16} />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-rice-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
                    <button onClick={handleExportJSON} className="w-full text-left px-3 py-1.5 text-xs hover:bg-rice-50">导出 JSON</button>
                    <button onClick={handleExportCSV} className="w-full text-left px-3 py-1.5 text-xs hover:bg-rice-50">导出 CSV</button>
                  </div>
                )}
              </div>
              <button
                onClick={handleClear}
                className="p-1.5 text-ink-400 hover:text-vermilion-500 hover:bg-rice-100 rounded cursor-pointer"
                title="清空日志"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-rice-100 rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索日志..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-rice-50 border border-rice-200 rounded-lg
                         focus:border-vermilion-300 focus:ring-2 focus:ring-vermilion-50 outline-none"
            />
          </div>

          {/* 级别筛选 */}
          <div className="flex gap-1">
            <FilterBtn label="全部" active={!filterLevel} onClick={() => setFilterLevel(null)} />
            {LEVEL_ORDER.map((level) => (
              <FilterBtn
                key={level}
                label={level}
                color={LEVEL_COLORS[level]}
                active={filterLevel === level}
                onClick={() => setFilterLevel(filterLevel === level ? null : level)}
              />
            ))}
          </div>
        </div>

        {/* 日志列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ink-300 text-sm">
              暂无日志
            </div>
          ) : (
            <div className="divide-y divide-rice-100">
              {logs.map((log) => (
                <LogItem
                  key={log.id}
                  log={log}
                  expanded={expandedId === log.id}
                  onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  onCopy={() => handleCopy(JSON.stringify(log, null, 2))}
                />
              ))}
            </div>
          )}
        </div>

        {/* 复制提示 */}
        {copied && (
          <div className="fixed bottom-20 right-6 bg-ink-700 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg animate-fade-in">
            已复制到剪贴板
          </div>
        )}
      </div>
    </>
  );
}

function FilterBtn({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
      style={{
        backgroundColor: active ? (color || '#8C8C8C') + '18' : 'transparent',
        color: active ? (color || '#5C5C5C') : '#8C8C8C',
      }}
    >
      {label}
    </button>
  );
}

function LogItem({ log, expanded, onToggle, onCopy }: { log: LogEntry; expanded: boolean; onToggle: () => void; onCopy: () => void }) {
  const time = new Date(log.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;

  return (
    <div className="group">
      <div
        onClick={onToggle}
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-rice-50 transition-colors"
      >
        {/* 颜色条 */}
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: LEVEL_COLORS[log.level], minHeight: '16px', width: '4px' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-300 font-mono">{timeStr}</span>
            <span className="font-medium" style={{ color: LEVEL_COLORS[log.level] }}>{log.level}</span>
            <span className="text-ink-400">{log.module}.{log.function}</span>
          </div>
          <p className="text-xs text-ink-500 mt-0.5 truncate">{log.message}</p>
        </div>

        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-ink-300 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-3 pb-3 pl-7 space-y-2">
          {log.stack && (
            <div className="bg-ink-700 text-green-400 text-xs p-2 rounded font-mono overflow-x-auto max-h-40 overflow-y-auto">
              <pre className="whitespace-pre-wrap">{log.stack}</pre>
            </div>
          )}
          <div className="bg-rice-50 rounded p-2 text-xs text-ink-400">
            <div className="grid grid-cols-2 gap-1">
              <span>路由: {log.context.route}</span>
              <span>屏幕: {log.context.screenSize}</span>
              {log.context.searchQuery && <span>搜索: {log.context.searchQuery}</span>}
              <span className="col-span-2">UA: {log.context.userAgent}</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
            className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-600 cursor-pointer"
          >
            <Copy size={12} />
            复制详情
          </button>
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
