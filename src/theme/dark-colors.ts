/**
 * 应用 dark mode 背景色阶梯（单一来源）
 *
 * 视觉层次（由深到浅）：
 *   L1 页面底      → Content 主区域
 *   L2 抬起面板    → Header / Sidebar / Tabs / 容器
 *   L3 玻璃浮层    → 首页顶部 Aurora 渐变（CSS 中维护，详见 main.module.css 中 .header.dark）
 *
 * 改一处即全局生效。新增页面/组件时，直接 import 此文件并使用 getThemedBg()。
 *
 * 浅色模式对应值仅作参考对照；Ant Design 在浅色下用其 token 体系即可。
 *
 * 注意：CSS 模块（main.module.css）的 .header.dark 是带 alpha 的渐变值，
 *       CSS 无法 import TS 常量，需要手动保持数值同步。
 */

/** L1 页面底色（最深）：主内容区背景 */
export const DARK_BG_PAGE = '#333333';

/** L2 抬起面板（次深）：Header / Sidebar / Tabs 条 / 列表容器 */
export const DARK_BG_PANEL = '#3a3a3a';

/** 全屏遮罩 / Loading 屏：与页面底同色，避免刺眼 */
export const DARK_BG_OVERLAY = DARK_BG_PAGE;

/** 浅色对照值 */
export const LIGHT_BG_PAGE = '#f5f5f5';
export const LIGHT_BG_PANEL = '#ffffff';
export const LIGHT_BG_OVERLAY = '#fafafa';

export type BgLevel = 'page' | 'panel' | 'overlay';

/**
 * 根据当前主题取色
 *
 * @example
 *   background: getThemedBg(isDarkMode, 'page')
 *   background: getThemedBg(isDarkMode, 'panel')
 */
export const getThemedBg = (isDark: boolean, level: BgLevel): string => {
  if (isDark) {
    switch (level) {
      case 'page':    return DARK_BG_PAGE;
      case 'panel':   return DARK_BG_PANEL;
      case 'overlay': return DARK_BG_OVERLAY;
    }
  }
  switch (level) {
    case 'page':    return LIGHT_BG_PAGE;
    case 'panel':   return LIGHT_BG_PANEL;
    case 'overlay': return LIGHT_BG_OVERLAY;
  }
};