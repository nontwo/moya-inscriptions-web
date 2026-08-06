// ============================================================
// 摩崖碑刻数字平台 - Design Tokens
// 古韵今风设计理念：宣纸色系 + 朱砂红点缀 + 墨色文字
// ============================================================

// ---- 颜色系统 ----
export const colors = {
  // 背景色 - 宣纸质感
  rice: {
    50: '#FDFBF7',
    100: '#F5F0E8',
    200: '#EDE4D3',
    300: '#D9CCB2',
    400: '#C4B391',
  },

  // 强调色 - 朱砂红
  vermilion: {
    50: '#FFF5F5',
    100: '#FEE2E5',
    200: '#FCA5B0',
    300: '#F8717D',
    400: '#E8485E',
    500: '#C41E3A',
    600: '#9B1628',
    700: '#7A0F1E',
  },

  // 文字色 - 墨色
  ink: {
    50: '#F5F5F5',
    100: '#E8E8E8',
    200: '#D1D1D1',
    300: '#B0B0B0',
    400: '#8C8C8C',
    500: '#5C5C5C',
    600: '#2C2C2C',
    700: '#1A1A1A',
  },

  // 辅助色
  gold: {
    300: '#D4A574',
    400: '#C4955A',
    500: '#B8860B',
  },

  // 功能色
  success: '#2E7D32',
  warning: '#E65100',
  info: '#1565C0',
  error: '#FF4444',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ---- 字体系统 ----
export const typography = {
  fontFamily: {
    serif: "'Noto Serif CJK SC', 'STSong', 'SimSun', serif",
    sans: "'PingFang SC', 'Microsoft YaHei', 'system-ui', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },

  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
    '6xl': '3.75rem',  // 60px
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },

  lineHeight: {
    tight: 1.25,
    normal: 1.6,
    relaxed: 1.8,
    loose: 2,
  },
} as const;

// ---- 间距系统 ----
export const spacing = {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
  24: '6rem',    // 96px
} as const;

// ---- 断点 ----
export const breakpoints = {
  xs: 360,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

// ---- 圆角 ----
export const borderRadius = {
  none: '0',
  sm: '0.25rem',   // 4px
  md: '0.5rem',    // 8px
  lg: '0.75rem',   // 12px
  xl: '1rem',      // 16px
  full: '9999px',
} as const;

// ---- 阴影 ----
export const shadows = {
  sm: '0 1px 3px rgba(44,44,44,0.06)',
  md: '0 2px 12px rgba(44,44,44,0.06), 0 1px 3px rgba(44,44,44,0.04)',
  lg: '0 6px 24px rgba(44,44,44,0.1), 0 2px 6px rgba(44,44,44,0.06)',
  xl: '0 12px 48px rgba(44,44,44,0.12), 0 4px 12px rgba(44,44,44,0.08)',
  none: 'none',
} as const;

// ---- 过渡动画 ----
export const transitions = {
  fast: '150ms ease',
  normal: '300ms ease',
  slow: '500ms ease',
} as const;

// ---- Z-Index ----
export const zIndex = {
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  modal: 400,
  popover: 500,
  tooltip: 600,
} as const;

// ---- 布局常量 ----
export const layout = {
  headerHeight: '64px',
  maxWidth: '1200px',
  sidebarWidth: '280px',
  logPanelWidth: '400px',
} as const;
