# Xtrend

[English](#english)

## 目录

- [项目简介](#项目简介)
- [安装与环境](#安装)
- [主要功能与使用](#使用)
- [工作原理与架构](#工作原理与架构)
- [本地开发与检查](#开发和复查)
- [隐私与联网](#本地保存与联网)
- [许可证](#许可证)

## 项目简介

当前交付版本：**0.2.9**。优化并修复 Thank-You 转发星图与 Grok 回复助手；检查结果见 [验证记录](docs/VERIFICATION.md)。

把 X 时间线变成本地阅读桌面：流速徽章、本页热榜、图片阅读、Markdown 复制、转发星图、Grok 回复草稿，以及评论屏蔽、色卡和私有监控。

界面支持 English、中文、日本語，以及浅色、深色和跟随系统。仅运行于 `https://x.com/*` 和 `https://pro.x.com/*`，不读取其他网站。

## 安装

新交付文件放在 `release/0.2.9/`，解压后安装。已有版本的交付文件保留在原处。

### Chrome / Edge

1. 解压对应浏览器的 ZIP。
2. 打开 Chrome 的“扩展程序 → 管理扩展程序”，或 Edge 的“扩展 → 管理扩展”。
3. 启用“开发者模式”，选择“加载已解压的扩展程序”，选中包含 `manifest.json` 的文件夹。
4. 刷新已经打开的 X 标签页，再把 Xtrend 固定到浏览器工具栏。

已有插件升级时，用新版文件覆盖原先加载的文件夹，再到扩展管理页点击“重新加载”，避免同时加载两个版本。升级前也可在“关于”中备份设置。

### Firefox

1. 解压 Firefox ZIP。
2. 打开 `about:debugging#/runtime/this-firefox`，选择“临时载入附加组件”，选中 `manifest.json`。
3. 此方式安装的版本在重启 Firefox 后需要重新载入。长期安装需要 Mozilla 签名；本项目不把未签名 ZIP 描述成永久可安装的商店版本。

最低版本：Chrome / Edge 111，Firefox 128。日常使用建议采用当前稳定版。Safari 与移动浏览器不在第一版交付范围。

Bark 在 Firefox 需要 140 或更新版本，并需要单独授权；旧版仍可使用本地功能。

## 使用

- **徽章**：普通、上升、爆款使用不同图形和文字。悬停或键盘聚焦可查看数量与更新时间。工具栏弹窗可调整分界值。
- **热榜**：拖动标题栏移动，右上角收起。拖动表头重排；键盘聚焦表头后也可使用 `Alt + ←/→`。点击推文定位，再点击返回箭头回到原来的位置。
- **定位连接线**：点击热榜中的推文标题会定位对应推文，同时给推文和热榜条目加上边框，并画出连接线。滚动页面、滚动列表、拖动浮窗和调整窗口时会跟随位置。点击页面空白处取消连接线和边框；点击另一条只保留新的一条。返回原位置、收起热榜或切换时间线也会清理标记。
- **热度榜设置**：点击热榜右上角设置图标，直接打开专用窗口。显示数量默认 10 条，可设为 1–1,000；六个显示项可独立开关。所有有效修改自动保存并立即生效，不需要点击保存。原来的语言、阈值等选项保留在“全部设置”。
- **仅看热帖**：同时过滤时间线和热榜，默认最低浏览量为 10,000，可自行修改；浏览量未知的推文保留。有新数据达到要求时会恢复显示。关闭过滤或取消当前范围会恢复原来的内容，不删除推文。
- **生效范围和贴边隐藏**：首页／推荐流、列表、个人主页和推文详情分别开关；不适用的页面不显示热榜。取消当前页面后，可从工具栏弹窗进入“热度榜设置”重新开启。点击标题栏新增的“靠边收起”按钮，会自动滑向最近的左侧或右侧；开启贴边隐藏后，把窗口拖到左右边缘松手也会收起。悬停、聚焦或点击边缘标签可临时展开，移开后重新收起。直接把收起的标签拖到页面任意位置即可恢复悬浮，窄窗口也适用。位置和贴边状态会保留。收起与展开连续滑动、渐隐渐现，拖动时立即跟手；系统开启减少动态效果时停用动画。
- **图片**：点击推文照片打开。滚轮缩放，拖动平移，双击切换原始比例与适应窗口；`+`、`-`、`0`、`Esc` 可用。长图以 900px 为目标宽度，不超出窗口。
- **复制**：打开原来的分享菜单，选择“复制为 Markdown”。剪贴板不可用时显示手动复制窗口。只有截断正文时会标注不完整。
- **星图**：点击推文旁的连线图标。可搜索、筛选，切换人物列表与引用河流；每次操作只加载一页。
- **Grok**：点击推文旁的星形图标。先检查所选正文与提示词，再主动生成。可复制或填入已打开的对应回复框，不自动发布。

### 工具栏扩展弹窗

点击浏览器工具栏的 Xtrend，打开过滤、流速榜、监控、外观、AI 评论和关于六个分区。右上角可切换语言、明暗模式或打开通用设置。没有试用期或付费锁。

- **内容屏蔽**：只处理详情页原推文下方、有明确回复关系的评论。宽松／标准／严格分别随附 1／23／26 条短语规则；白名单先于黑名单和规则。可逐条停用规则、增删改自定义规则，或导入本地文件。首页、搜索、个人主页和原推文不受这项过滤影响；“仅看热帖”是独立开关。
- **规则文件**：规则随安装包更新，不联网下载。导入版本 1 的 JSON，最多 100 条、100KB，普通文字短语不执行代码。可导出导入及自定义规则；导出不包含设备标识或监控记录。
- **自定义色卡**：四个预设，最多 12 张自定义色卡，分别调整底色、文字色和强调色。保存后应用到弹窗、热榜、徽章和连接线；深色自动适配。颜色过于接近时会提示调整。
- **私有热帖监控**：填写账号或关键词和最低浏览量／平均流速后保存并开启。账号或关键词任一个命中，再同时满足两个数值门槛才记录；门槛设为 0 表示不限制该项。只处理浏览时已看到的内容，不额外刷新 X，也不会在关页后继续巡回。
- **Bark**：在监控分区填写服务器基础地址与设备标识，点击授权并启用。只发送作者、命中原因、数量、原文链接，不发送正文。先发送测试通知，再检查手机。服务器接受不等于手机送达。每分钟最多 5 条，超出仅记录，可手动重试；旧记录不会自动补发。
- **监控记录**：仅本机保留最近 30 天、最多 200 条，可一键清除。同一账号下保留中的同一推文不会重复自动推送。

规则文件示例：

```json
{"version":1,"rules":[{"id":"my-promo","label":"自定义推广","terms":["示例推广短语"],"match":"any","severity":2,"enabled":true}]}
```

`severity` 3 表示宽松起生效、2 表示标准起、1 表示仅严格；`match` 可为 `any` 或 `all`。

### 星图与 Grok 的连接

打开星图后自动读取一页转发者；切换引用时读取引用列表。人物列表、搜索和分类筛选处理已加载结果。只有点击“下一页”才继续加载。星图只反映 X 公开返回的数据，并不代表完整传播关系。

无需提前手动建立 Grok 对话。检查提示词后点击生成，插件临时打开后台标签页中的 X 原生 Grok 页面，由 X 自己完成发送并将回复带回助手。提示词交给 X/Grok 处理，普通对话可能保留在其历史中。插件不复制登录资料，也不把旧对话或附件带入新请求。临时聊天仍须确认可用后才启用。

阅读页面不会跳转。取消或生成结束后关闭临时 Grok 标签页；转发／引用标签页保留供后续翻页，读完最后一页、切换账号、离开阅读页面或过期后关闭。重新打开浏览器后如需继续旧缓存的下一页，请先点击刷新。

如果 X 要求重新登录、达到使用上限或页面没有完成加载，会显示失败原因。扩展更新后，必须刷新已经打开的 X 标签页；只重新加载扩展无法更新旧页面里的功能。

## 0.2.0 新增操作

- **本机自检与备份**：工具栏弹窗 → 关于。自检显示已读数量、最近收到数据、连接是否观察到、本地空间和监控状态，不额外请求 X。导出检查结果不包含凭据、正文、账号名或推文链接。备份包含设置、规则、色卡、模板和名单，文件应妥善保管；不包含 Bark 设备标识、缓存或命中记录。导入后先预览，确认恢复后监控与 Bark 均关闭。
- **屏蔽原因与恢复**：热榜底部“查看屏蔽记录”，可查看原因、本页临时显示或加入作者白名单。即使关闭热榜，也有独立恢复入口。临时恢复随页面切换清除，不修改原推文。
- **数据新鲜度与趋势**：徽章提示显示最后读数和增长观察区间；超过五分钟没有新读数会提示。推文旁的趋势按钮只画已取得的读数，每条最多 60 点，关闭页面或切换时间线清除，不自动刷新以补点。
- **通知控制**：监控分区可设置安静时段（本机时区，开始和结束相同表示不限制）、合并等待 0–60 分钟、两次发送间隔 0–1,440 分钟。安静时段命中先本地排队，结束后最多每组 10 条发送；长通知会截短。发送失败等待 30 秒，所有尝试包括测试、重试合计每分钟最多 5 次。浏览器关闭时不发送，重新运行后处理待发项；停用 Bark 后待发项不会自动补发。
- **单独监控门槛**：监控条件表单可填写 `account | handle | 最低浏览量 | 最低浏览/小时` 或 `keyword | 关键词 | 最低浏览量 | 最低浏览/小时`，每行一项。单独目标门槛优先于共同门槛；账号与关键词仍是“任一命中”。保存后才生效。
- **Pro 按列操作**：在多列页面的热榜选择列，再打开热榜设置，可保存当前列的条数、最低浏览量和是否监控。最低浏览量在“仅看热帖”开启时使用；全部列模式仍使用全局条数。列规则对应显示顺序，重排列后需核对；真实 X Pro 需要相应账号权限。
- **手动批量导出**：热榜底部“选择并导出”，在选择窗口中勾选当前分组已读取的推文，最多 200 条，可复制或下载 Markdown。不会保存长期阅读历史。
- **保存与冲突提示**：自动开关立即保存；有保存按钮的表单需要点击按钮。在弹窗内切换分区时，未保存内容会要求选择继续编辑或放弃。其他窗口修改了正在编辑的名单或模板时，会保留输入并提示冲突。关闭浏览器弹窗仍可能丢失未保存编辑，请先点击保存。

## 指标说明

发布以来平均速度 = 最近一次准确浏览量 ÷ 发布至该次读取的小时数。发布不足一分钟、缺少准确浏览量或发布时间时显示“—”。默认每小时 1,000 为上升起点，10,000 为爆款起点。

爆帖指数 = 平均速度 ÷ 自定义爆款起点 × 100。这是 Xtrend 自定义指标，不是 X 的评分。

实测增长 = 两次准确读数的浏览量差 ÷ 两次读取相隔的小时数，至少相隔一分钟；这是折算速度，不是最近一小时的实际浏览量。还没有足够读数时单列为“发布以来平均”。数字会随 X 提供的新读数更新，每个速率下面显示该次读取时间；悬停可查看原始浏览量、发布时间和测量区间。显示值会四舍五入。

Xtrend 不定时刷新 X 或额外请求浏览量；没有新读数就不能知道后续增长。重复扫描未变的页面不算新读数，超过五分钟没有新读数时显示“—”并标记已过期。简写的 12K、1.2M、10万不能当作准确数量参与计算；下调后的准确读数会替换旧值，并重新开始测量增长。

默认本地预览不连接 X，不显示帖子数字，也不能运行监控。专门用于界面检查的构造输入只在开发环境显式开启时可用，仍不能生成监控记录。正式扩展不包含演示帖子或预置命中，只使用 X 页面及其已加载回应中的读数，更新速度取决于 X。新监控记录分别保留数量读取时间和命中时间；旧记录未保存读取时间时显示未知。

## 工作原理与架构

Xtrend 由页面读取、内容整理、界面展示和本机保存几部分组成。页面脚本只读取 X 页面已显示的内容；扩展后台处理设置、维护和可选通知；工具栏弹窗提供配置入口。数据经校验后在浏览器本机整理和计算，不需要 Xtrend 自有服务器。

| 模块 | 作用 |
| --- | --- |
| `entrypoints/` | 浏览器扩展入口：X 页面工作区、后台、弹窗，以及页面与扩展之间的消息桥接。 |
| `src/page/` | 识别受支持的 X 页面数据与连接，并向扩展转交有限的读取请求。 |
| `src/content/` | 接收页面数据、整理推文状态、计算可见内容，并连接界面和操作。 |
| `src/core/` | 与界面分开的功能逻辑：设置校验、排名、过滤、指标、缓存、备份、Markdown、星图和监控。 |
| `src/ui/` | 徽章、热榜、图片阅读器、星图、Grok 草稿助手、设置与监控面板。 |
| `src/platform/` | 浏览器本机存储、设置同步、后台通知和临时标签页等浏览器功能。 |
| `preview/`、`tests/`、`scripts/` | 合成数据预览、自动检查与交付辅助；预览数据不会装入正式扩展。 |

基本运行流程：X 页面出现内容 → 页面读取层提取受支持字段 → 内容模型校验并整理 → 核心逻辑计算徽章、排序或过滤结果 → 界面显示。只有用户主动使用星图、高清图片、Grok 或 Bark 时，才会向相应的 X 页面或用户指定服务器发出请求。

更多实现说明见[架构说明](docs/架构说明.md)；当前版本的检查范围和限制见[验证记录](docs/VERIFICATION.md)。

## 本地保存与联网

不设置服务器、不加入统计、广告、追踪或远程代码。字体和图标随扩展附带。

本机保存设置、提示词模板、过滤规则、色卡、Bark 设备标识、监控命中记录与按账号分开的星图缓存。星图缓存七天过期，总量不超过 5MB；监控记录保留 30 天、最多 200 条且不含正文。匿名状态下不保存星图。回复草稿与速度采样只在页面内存中。

用户主动加载星图、高清图片、生成 Grok 草稿时，才会发起相应的 X 请求。Grok 会把提示词交给 X 处理；X 的数据处理方式适用其自身政策。[隐私说明](PRIVACY.md)

Bark 默认关闭。启用并授权后，命中通知和手动测试会连接你指定的 Bark 服务器；其处理方式适用该服务器及手机通知服务自身政策。

## 安装与环境

使用已打包的扩展不需要安装 Node.js，也不需要运行本项目的开发服务器。安装包位于 `release/0.2.9/`。Chrome、Edge 最低版本为 111，Firefox 最低版本为 128；建议使用当前稳定版。Firefox 安装包采用临时载入方式，重启浏览器后需重新载入；永久安装需要 Mozilla 签名。Firefox 上使用 Bark 需 Firefox 140 或更新版本并单独授权。

### 本地开发前提

- Node.js 22.12 或更新的 22.x，或 Node.js 24。
- npm（随 Node.js 安装）。
- Chromium、Firefox 浏览器仅在运行浏览器交互检查时需要；Playwright 浏览器可按下方命令安装。
- 使用扩展功能需要 X 的受支持页面与相应账号权限。Grok、Pro、Bark 等可选功能另受 X、浏览器或通知服务的访问限制。

## 开发和复查

```sh
npm ci
npm run check
npm test
npm run build:all
npm run zip:all
# 完整交付检查与打包
npm run release
```

浏览器交互检查需要另开一个终端运行 `npm run preview`，然后运行：

```sh
npx playwright install chromium firefox
npm run test:browser
```

`preview/` 是明确标识的合成数据验证页，不会连接 X，不会包含在浏览器安装包中。它不证明真实 X 或 Grok 当前可用。

更多内容：[架构与难点](docs/架构说明.md)、[验证记录](docs/VERIFICATION.md)、[第三方许可](THIRD_PARTY_NOTICES.md)。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。第三方依赖及随附组件的许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

<a id="english"></a>

# Xtrend — English

[回到中文版](#xtrend)

Xtrend is a local reading workspace for X. It adds reading, ranking, filtering, and drafting tools to supported X pages. It runs as a browser extension for Chrome, Edge, and Firefox, and does not require an Xtrend server.

**Current release: 0.2.9.** The packaged builds are in `release/0.2.9/`. See the [verification record](docs/VERIFICATION.md) for the checked flows and remaining limitations.

## What it does

- **Reading-speed badges:** Shows post view counts, average views per hour, observed growth, and freshness when the page provides accurate readings.
- **Page rankings:** Ranks posts already seen on the current page, supports configurable fields and thresholds, and lets you jump to a post and return to your previous reading position.
- **Hot-post filtering:** Filters the timeline and ranking by a minimum view count. Posts with unknown counts remain visible; filtering does not delete posts.
- **Comment filtering:** Applies local allowlists, blocklists, and phrase rules to replies with a clear reply relationship on a post detail page. Rules can be customized or imported from a local JSON file.
- **Image reader:** Opens post images with zoom and pan controls, including a tall-image reading layout.
- **Markdown copy and export:** Copies a post as Markdown and exports selected posts already loaded in a ranking.
- **Repost and quote map:** Browses X-returned repost and quote results, with search, filtering, pagination, and a quote river. Results may be incomplete.
- **Grok reply drafts:** Reviews the prompt before the user starts generation. The result is a draft that can be copied or placed into the matching reply box; it is not published automatically.
- **Private monitoring:** Watches only posts encountered while browsing and records local matches against configured accounts or keywords and view or speed thresholds.
- **Optional Bark notifications:** Sends limited match details to a user-configured Bark server after explicit setup and authorization. Bark is off by default.
- **Appearance and settings:** Supports English, Simplified Chinese, and Japanese; light, dark, or system themes; custom palettes; settings backup; and local diagnostics.

## Install the extension

No Node.js setup is needed to install a packaged extension.

### Chrome and Edge

1. Unzip the matching browser package from `release/0.2.9/`.
2. Open the browser's extensions management page and enable Developer mode.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Refresh open X tabs, then pin Xtrend to the browser toolbar.

To upgrade, replace the previously loaded folder with the new files and reload the extension from its management page. Avoid loading two copies at once.

### Firefox

1. Unzip the Firefox package.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on** and choose the package's `manifest.json`.

Temporary add-ons must be loaded again after Firefox restarts. A permanently installable release requires Mozilla signing. The minimum browser versions are Chrome/Edge 111 and Firefox 128. Bark requires Firefox 140 or newer and separate permission.

## Basic use

1. Open or refresh a supported page at `https://x.com/` or `https://pro.x.com/`.
2. Read the badges next to posts and open the floating ranking to sort posts already seen on the page.
3. Open Xtrend from the browser toolbar to configure filters, ranking, monitoring, appearance, AI drafts, and other settings.
4. Use a post's image, Markdown, map, or Grok controls when needed. Review a Grok prompt and draft before copying or placing it in a reply box.
5. For monitoring, configure a target and thresholds in the Monitoring section. Enable Bark separately only if notifications are wanted.

Example local phrase-rule file:

```json
{"version":1,"rules":[{"id":"my-promo","label":"Custom promotion","terms":["example phrase"],"match":"any","severity":2,"enabled":true}]}
```

`severity` 3 applies in relaxed mode, 2 in standard mode, and 1 only in strict mode. `match` accepts `any` or `all`.

## How it works

Xtrend reads supported content from the active X page, validates and normalizes it in the extension, calculates rankings and indicators locally, and renders its own controls beside the page. The page-reading layer does not inspect other websites. Settings and selected records are stored in browser-local storage; transient post readings and reply drafts stay in page memory.

| Area | Responsibility |
| --- | --- |
| `entrypoints/` | Browser extension entry points for the page workspace, background tasks, popup, and message bridge. |
| `src/page/` | Detects supported X page data and routes limited page operations. |
| `src/content/` | Receives page data, maintains the post model, and connects page actions to the interface. |
| `src/core/` | Shared logic for settings validation, rankings, filtering, metrics, caching, backup, Markdown, maps, and monitoring. |
| `src/ui/` | Badges, rankings, image reader, map, Grok draft assistant, settings, and monitoring views. |
| `src/platform/` | Browser storage, settings synchronization, background notifications, and temporary tabs. |
| `preview/`, `tests/`, `scripts/` | Synthetic-data preview, automated checks, and release helpers. Preview fixtures are excluded from browser packages. |

For more detail, read the [architecture notes](docs/架构说明.md). Xtrend has no analytics, advertising, tracking, or remote code. User-initiated map, image, and Grok actions contact X; enabled Bark notifications contact the server configured by the user. See the [privacy notes](PRIVACY.md).

## Development prerequisites and commands

- Node.js 22.12+ (22.x) or Node.js 24.
- npm.
- Install Playwright browsers only if running browser interaction checks.

```sh
npm ci
npm run check
npm test
npm run build:all
npm run zip:all
npm run release
```

For browser interaction checks, start `npm run preview` in a separate terminal, then run:

```sh
npx playwright install chromium firefox
npm run test:browser
```

The preview uses synthetic data, does not connect to X, and is not included in the extension packages. It does not establish that live X, Grok, Edge, Firefox accounts, or Bark delivery work. See the [verification record](docs/VERIFICATION.md) for the current scope.

## License

Xtrend is distributed under the [MIT License](LICENSE). Third-party notices are available in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
