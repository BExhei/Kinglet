/**
 * Kinglet UI 字符集中管理
 * 当前：中文。切换语言只需新建 strings-en.js 并改 import。
 * 命名规则：SECTION_ITEM（菜单/按钮）或 SECTION_DESCRIPTION（提示/说明）
 */

const STRINGS = {

  // ===== 菜单栏 =====
  menu_file: "文件",
  menu_view: "视图",
  menu_settings: "设置",
  menu_help: "帮助",

  menu_open: "打开文件…",
  menu_print: "打印…",
  menu_toggle_sidebar: "切换侧栏",
  menu_toggle_theme: "切换深浅色",
  menu_ui_settings: "界面设置",
  menu_backup_settings: "备份设置",
  menu_about: "关于 Kinglet",
  menu_check_update: "检查更新",

  // ===== 欢迎页 =====
  welcome_title: "Kinglet",
  welcome_sub: "开箱即读，专注不打断",
  welcome_hint: "打开一个 .md 或 .txt 文件，或直接拖进来。",
  welcome_open_btn: "打开文件",

  // ===== 侧栏 =====
  sidebar_search_placeholder: "页内查找…",
  sidebar_toc_title: "目录",
  sidebar_search_prev: "上一个",
  sidebar_search_next: "下一个",
  sidebar_search_clear: "清除",
  sidebar_toc_empty: "无标题",

  // ===== 标签栏 =====
  tab_close_title: "关闭 (Ctrl+W)",
  tab_open_title: "打开文件 (Ctrl+O)",
  tab_theme_title: "切换深浅色 (Ctrl+Shift+L)",

  // ===== 右键菜单 =====
  ctx_open: "打开文件…",
  ctx_print: "打印…",
  ctx_find: "查找…",
  ctx_toggle_sidebar: "切换侧栏",
  ctx_toggle_theme: "切换主题",
  ctx_copy: "复制",
  ctx_select_all: "全选",
  ctx_settings: "设置…",

  // ===== 设置面板 =====
  settings_title: "设置",
  settings_close_title: "关闭 (Esc)",
  settings_tab_ui: "界面",
  settings_tab_backup: "备份",
  settings_restore_default: "恢复界面默认",

  // 一键方案
  preset_day: "日间阅读",
  preset_day_desc: "纸白 · 衬线 · 16px",
  preset_eyecare: "护眼长读",
  preset_eyecare_desc: "米黄 · 衬线 · 17px",
  preset_night: "夜间",
  preset_night_desc: "夜间 · 无衬线 · 16px",
  preset_compact: "紧凑速览",
  preset_compact_desc: "暖纸 · 无衬线 · 14px",

  // 背景主题
  theme_white: "纸白",
  theme_light: "暖纸",
  theme_sepia: "米黄",
  theme_green: "青苹果",
  theme_dark: "夜间",
  theme_black: "纯黑",

  // 字体
  font_sans: "无衬线",
  font_serif: "衬线",
  font_kai: "楷体",
  font_custom: "自定义",
  font_pick: "点击选择字体文件…",
  font_hint: "支持 .ttf / .otf / .woff2 / .ttc。只记路径不复制文件，原文件移走则失效。",

  // 字号/行距
  font_size_label: "字号",
  line_height_label: "行距",
  lh_compact: "紧凑",
  lh_standard: "标准",
  lh_loose: "宽松",

  // 备份
  backup_export_title: "导出",
  backup_export_desc: "把界面设置存成一个 JSON 文件。",
  backup_export_btn: "导出配置…",
  backup_import_title: "导入",
  backup_import_desc: "从备份文件恢复。当前设置会被覆盖。",
  backup_import_btn: "导入配置…",
  backup_reset_title: "重置",
  backup_reset_desc: "清空界面设置，回到初装状态。",
  backup_reset_btn: "清空全部数据",
  backup_reset_confirm: "清空界面设置？此操作不可撤销。",
  backup_status_exported: "已导出到 ",
  backup_status_imported: "已恢复（导出于 ",
  backup_status_reset: "已清空，回到初装状态",
  backup_status_export_fail: "导出失败：",
  backup_status_import_fail: "导入失败：",
  backup_status_parse_fail: "解析失败：",
  backup_status_not_kinglet: "这不像 Kinglet 的备份文件",
  backup_status_browser: "浏览器模式下不支持文件操作",

  // ===== 浮动搜索 =====
  floating_search_placeholder: "页内查找…",

  // ===== 更新 =====
  update_available_title: "发现新版本 v{version}！",
  update_available_body: "{notes}\n\n是否现在下载并安装？",
  update_confirm_btn: "更新",
  update_no_update: "当前已是最新版本",
  update_browser_mode: "浏览器模式下无法检查更新",
  update_fail: "检查更新失败：",
  update_downloading: "正在下载更新…",

  // ===== 关于 =====
  about_title: "\u5173\u4e8e Kinglet",
  about_tagline: "开箱即读，专注不打断 \u00b7 Open it, read it — distraction-free",
  about_github: "GitHub \u4ed3\u5e93",
  about_license: "\u5f00\u6e90\u534f\u8bae",
  about_close_title: "\u5173\u95ed (Esc)",
  align_default: "\u9ed8\u8ba4\uff08\u8ddf\u968f\u6587\u6863\uff09",
  align_left: "\u5de6\u5bf9\u9f50",
  align_right: "\u53f3\u5bf9\u9f50",
  align_center: "\u5c45\u4e2d",
  align_justify: "\u4e24\u7aef\u5bf9\u9f50\u672b\u884c\u5de6\u5bf9\u9f50",
  align_justify_right: "\u4e24\u7aef\u5bf9\u9f50\u672b\u884c\u53f3\u5bf9\u9f50",

  // ===== 错误 =====
  error_open_file: "打开文件失败：",
  error_custom_font_fail: "字体文件加载失败（可能已被移动或删除）",
  error_pick_font_fail: "选择字体失败：",

  // ===== 脚注 =====
  footnotes_label: "脚注",

  // ===== 文件对话框 =====
  dialog_font_filter: "字体",
  dialog_backup_filter: "JSON",
  dialog_backup_filename: "kinglet-backup-",

  // ===== 打印 =====
  // （CSS content 属性用 CSS 变量 --str-footnotes-label 控制，见 styles.css）
};

export default STRINGS;
