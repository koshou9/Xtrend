import type { Language } from "../core/types";
const en = {
  library: "Saved posts",
  savePost: "Save post",
  libraryHelp:
    "Only posts you save are kept on this device, across accounts. Up to 100 posts / 2MB. Export before removing the extension. Settings backups do not include saved posts.",
  empty: "No matching posts",
  tags: "Tags (comma separated)",
  note: "Note",
  save: "Save",
  remove: "Remove",
  search: "Search text",
  author: "Author",
  since: "Published since",
  clear: "Clear filters",
  loaded: "Searches posts already read on this page only.",
  csv: "Download spreadsheet",
  exportLibrary: "Export saved posts",
  libraryFull: "Saved storage is full. Export and remove some posts first.",
  error: "Could not save or load. Try again; your current input is still here.",
  saved: "Saved on this device",
  presets: "Reading presets",
  reading: "Daily reading",
  research: "Research",
  focus: "Hot posts",
  presetHelp:
    "Changes the ranking display only. Your rules, monitoring and notification choices stay as set.",
  preview: "Try filter rules",
  previewHelp:
    "Paste a representative reply to try the current form without saving or hiding anything.",
  sample: "Sample reply",
  handle: "Author handle",
  hidden: "Would hide",
  visible: "Would keep",
  repeat: "Remind again after views grow",
  repeatHelp:
    "Off by default. A new accurate reading must increase views by this percentage since the last match, at least 5 minutes later. Only while browsing; existing notification limits still apply.",
  off: "Off",
  refreshHelp:
    "After updating Xtrend, refresh your open X pages. If a tool fails, check your X login, refresh the page, then retry; wait if X limits requests.",
  exportSelected: "Export selected posts",
} as const;
type Key = keyof typeof en;
const zh: Record<Key, string> = {
  library: "收藏夹",
  savePost: "收藏帖子",
  libraryHelp:
    "只保存你主动收藏的内容，在本机跨账号可见。最多100条／2MB。移除扩展前请先导出；设置备份不包含收藏。",
  empty: "没有符合条件的帖子",
  tags: "标签（逗号分隔）",
  note: "备注",
  save: "保存",
  remove: "移除",
  search: "搜索正文",
  author: "作者",
  since: "发布时间起点",
  clear: "清除筛选",
  loaded: "仅搜索本页已经读到的帖子。",
  csv: "下载表格",
  exportLibrary: "导出收藏",
  libraryFull: "收藏空间已满，请先导出并移除部分内容。",
  error: "保存或读取失败，请重试；当前输入仍然保留。",
  saved: "已保存到本机",
  presets: "阅读场景",
  reading: "日常阅读",
  research: "资料收集",
  focus: "重点热帖",
  presetHelp: "只调整热榜显示；规则、监控和通知仍按你原来的选择执行。",
  preview: "试用过滤规则",
  previewHelp:
    "粘贴一条有代表性的回复，先试当前表单中的规则，不会保存或隐藏内容。",
  sample: "示例回复",
  handle: "作者账号",
  hidden: "将隐藏",
  visible: "将保留",
  repeat: "浏览量增长后再次提醒",
  repeatHelp:
    "默认关闭。至少间隔5分钟，新的准确浏览量比上次命中增长所选比例后再次提醒。仅浏览时检查，仍受通知次数和安静时段限制。",
  off: "关闭",
  refreshHelp:
    "更新Xtrend后，请刷新已经打开的X页面。工具失败时，先确认X已登录、刷新页面再重试；遇到次数限制请稍后再试。",
  exportSelected: "导出所选帖子",
};
const ja: Record<Key, string> = {
  library: "保存した投稿",
  savePost: "投稿を保存",
  libraryHelp:
    "明示的に保存した投稿のみ、この端末に保存します。アカウント間で共有、最大100件／2MB。拡張削除前に書き出してください。設定バックアップには含まれません。",
  empty: "一致する投稿はありません",
  tags: "タグ（カンマ区切り）",
  note: "メモ",
  save: "保存",
  remove: "削除",
  search: "本文を検索",
  author: "投稿者",
  since: "投稿日以降",
  clear: "絞り込みを解除",
  loaded: "このページで読んだ投稿のみ検索します。",
  csv: "表をダウンロード",
  exportLibrary: "保存した投稿を書き出す",
  libraryFull: "保存領域がいっぱいです。書き出して一部を削除してください。",
  error:
    "保存または読み込みに失敗しました。入力は保持されています。再試行してください。",
  saved: "端末に保存しました",
  presets: "閲覧プリセット",
  reading: "日常の閲覧",
  research: "資料収集",
  focus: "注目の投稿",
  presetHelp:
    "ランキング表示のみ変更します。ルール、監視、通知の設定は維持します。",
  preview: "ルールを試す",
  previewHelp:
    "返信例を貼り付けて現在の入力を試します。保存や非表示は行いません。",
  sample: "返信例",
  handle: "投稿者ID",
  hidden: "非表示になります",
  visible: "表示されます",
  repeat: "閲覧数の増加で再通知",
  repeatHelp:
    "初期設定はオフ。前回から5分以上経過し、新しい正確な閲覧数が指定割合増えた場合に再通知します。閲覧中のみ確認し、通知制限と静かな時間帯を守ります。",
  off: "オフ",
  refreshHelp:
    "Xtrend更新後は開いているXページを再読み込みしてください。失敗時はログインを確認し再読み込みして再試行。利用制限の場合は時間を置いてください。",
  exportSelected: "選択した投稿を書き出す",
};
export const researchT =
  (language: Language) =>
  (key: Key): string =>
    ({ en, zh, ja })[language][key];
