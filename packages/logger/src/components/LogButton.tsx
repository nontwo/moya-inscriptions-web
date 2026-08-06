import { useState, useEffect } from 'react';
import { logCollector } from '../core/LogCollector';

interface LogButtonProps {
  onClick: () => void;
}

export function LogButton({ onClick }: LogButtonProps) {
  const [errorCount, setErrorCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // 延迟显示，等页面加载完
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsub = logCollector.subscribeErrorCount((count) => {
      setErrorCount(count);
    });
    return unsub;
  }, []);

  if (!visible) return null;

  const hasErrors = errorCount > 0;

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      style={{ right: '20px', bottom: '24px' }}
    >
      <button
        onClick={onClick}
        onMouseDown={(e) => {
          if (e.button === 0) setDragging(true);
        }}
        onMouseUp={() => setDragging(false)}
        className={`relative w-11 h-11 rounded-full flex items-center justify-center
                     shadow-lg transition-all duration-300 hover:scale-110 active:scale-95
                     ${hasErrors
                       ? 'bg-vermilion-500 text-white animate-pulse-soft shadow-vermilion-200'
                       : 'bg-white/70 text-ink-400 hover:bg-white hover:text-ink-600 border border-rice-300'
                     }`}
        title={hasErrors ? `${errorCount} 个错误` : '日志面板'}
      >
        {/* 日志图标 */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>

        {/* 错误计数徽章 */}
        {hasErrors && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white text-vermilion-500
                           text-xs font-bold rounded-full flex items-center justify-center
                           shadow-md animate-pulse-soft">
            {errorCount > 99 ? '99+' : errorCount}
          </span>
        )}
      </button>
    </div>
  );
}
