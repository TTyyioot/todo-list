/**
 * icons.js — SVG 图标定义（内联，无需外部文件）
 * 每日待办事项清单
 */

const ICONS = {
  // 复选框 — 未选中
  checkboxEmpty: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="1" y="1" width="20" height="20" rx="5" stroke="currentColor" stroke-width="2" fill="none"/>
  </svg>`,

  // 复选框 — 已选中（带勾）
  checkboxChecked: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="1" y="1" width="20" height="20" rx="5" fill="#4CAF50" stroke="#4CAF50" stroke-width="2"/>
    <path d="M6 11.5L9.5 15L16 7.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // 星标 — 空心
  starEmpty: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1.5L11.4 6.75L17.25 7.65L12.9 11.7L13.95 17.55L9 14.7L4.05 17.55L5.1 11.7L0.75 7.65L6.6 6.75L9 1.5Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
  </svg>`,

  // 星标 — 实心
  starFilled: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1.5L11.4 6.75L17.25 7.65L12.9 11.7L13.95 17.55L9 14.7L4.05 17.55L5.1 11.7L0.75 7.65L6.6 6.75L9 1.5Z" fill="#FFB300" stroke="#FFB300" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,

  // 置顶
  pin: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M9.5 1.5L14.5 6.5L12 9L9 14L7 12L4 15L1 12L4 9L2 7L7 4L9.5 1.5Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
  </svg>`,

  pinFilled: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M9.5 1.5L14.5 6.5L12 9L9 14L7 12L4 15L1 12L4 9L2 7L7 4L9.5 1.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
  </svg>`,

  // 删除
  trash: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 4H14M5.5 4V2.5C5.5 1.95 5.95 1.5 6.5 1.5H9.5C10.05 1.5 10.5 1.95 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.2 13C4.25 13.85 4.95 14.5 5.8 14.5H10.2C11.05 14.5 11.75 13.85 11.8 13L12.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // 颜色
  palette: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3" fill="none"/>
    <circle cx="8" cy="8" r="3.5" fill="currentColor"/>
  </svg>`,

  // 标签
  tag: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 1.5H7L14.5 9L9 14.5L1.5 7V1.5Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
    <circle cx="4.5" cy="4.5" r="1" fill="currentColor"/>
  </svg>`,

  // 提醒/闹钟
  bell: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6.5 2C4.5 2.5 2.5 4 2.5 7.5V11L1 12.5H15L13.5 11V7.5C13.5 4 11.5 2.5 9.5 2V1.5C9.5 0.95 9.05 0.5 8.5 0.5H7.5C6.95 0.5 6.5 0.95 6.5 1.5V2Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
    <path d="M5.5 13.5C5.5 14.6 6.4 15.5 7.5 15.5H8.5C9.6 15.5 10.5 14.6 10.5 13.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  </svg>`,

  // 编辑
  edit: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M10 1.5L12.5 4L4.5 12H2V9.5L10 1.5Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
  </svg>`,

  // 拖拽手柄
  grip: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
    <circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/>
    <circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/>
    <circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/>
  </svg>`,

  // 便签/备注
  note: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.3" fill="none"/>
    <line x1="4" y1="5" x2="12" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="4" y1="11" x2="9" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,
};
