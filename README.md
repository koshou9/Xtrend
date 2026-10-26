# Xtrend

[English](#english)

## 0.3.3 本次更新

- 星图顶部原帖作者和人物列表显示 X 返回的头像，点击头像打开主页，点击列表姓名在星图中定位。重新打开或刷新时更新资料，头像不可用时显示文字占位。
- 收藏夹支持搜索正文、作者、标签与备注，按标签筛选、展开全文、编辑标签与备注，以及导出和合并导入。
- 收藏编辑提供未保存提醒，移除前需确认；导入前先预览，只合并新增内容，不覆盖已有收藏和备注。

此前版本已加入三种 AI 评论来源、可编辑模板、阅读场景、本页搜索、表格导出和可选再次提醒。版本变化见[变更记录](CHANGELOG.md)，优化范围见[优化说明](docs/OPTIMIZATION-0.3.0.md)。

## 目录

- [项目简介](#项目简介)
- [安装与环境](#安装)
- [主要功能与使用](#使用)
- [收藏与资料整理](#收藏与资料整理)
- [工作原理与架构](#工作原理与架构)
- [本地开发与检查](#开发和复查)
- [验证范围与已知限制](#验证范围与已知限制)
- [隐私与联网](#本地保存与联网)
- [许可证](#许可证)

## 项目简介

当前源码版本：**0.3.3**。支持 Chrome、Edge 和 Firefox，使用 WXT、React 和 TypeScript 构建；不需要部署 Xtrend 服务器。

把 X 时间线变成本地阅读桌面：流速徽章、本页热榜、图片阅读、Markdown 与表格导出、转发星图、收藏夹、AI 评论草稿，以及评论屏蔽、色卡和私有监控。

界面支持 English、中文、日本語，以及浅色、深色和跟随系统。阅读工具仅注入 `https://x.com/*` 和 `https://pro.x.com/*`；可选 AI 和 Bark 服务只在配置并授权后连接。检查范围见[验证记录](docs/VERIFICATION.md)。

## 安装

GitHub 仓库保存源码，不包含 `release/` 下的安装包、缓存或本地检查记录。如果已取得安装包，按下方步骤载入；从源码安装请先执行：

```sh
npm ci
npm run build
```

Chrome 加载生成的 `.output/chrome-mv3/` 文件夹即可。需要 Edge 或 Firefox 时，运行 `npm run build:all`，分别使用 `.output/edge-mv3/` 和 `.output/firefox-mv3/`。

完整交付包通过 `npm run release` 生成，位于 `release/0.3.3/`，包括 `Xtrend-0.3.3-chrome.zip`、`Xtrend-0.3.3-edge.zip`、`Xtrend-0.3.3-firefox.zip`、源码 ZIP、安装说明与校验值。所需环境和完整检查步骤见[开发和复查](#开发和复查)。

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

Firefox 中 Bark 和外部 AI 服务需要 140 或更新版本，并需要网站内容与目标服务器访问授权；旧版仍可使用本地阅读功能。

## 使用

- **徽章**：普通、上升、爆款使用不同图形和文字。悬停或键盘聚焦可查看数量与更新时间。工具栏弹窗可调整分界值。
- **热榜**：拖动标题栏移动，右上角收起。拖动表头重排；键盘聚焦表头后也可使用 `Alt + ←/→`。点击推文定位，再点击返回箭头回到原来的位置。
- **定位连接线**：点击热榜中的推文标题会定位对应推文，同时给推文和热榜条目加上边框，并画出连接线。滚动页面、滚动列表、拖动浮窗和调整窗口时会跟随位置。点击页面空白处取消连接线和边框；点击另一条只保留新的一条。返回原位置、收起热榜或切换时间线也会清理标记。
- **热度榜设置**：点击热榜右上角设置图标，直接打开专用窗口。显示数量默认 10 条，可设为 1–1,000；六个显示项可独立开关。所有有效修改自动保存并立即生效，不需要点击保存。原来的语言、阈值等选项保留在“全部设置”。
- **仅看热帖**：同时过滤时间线和热榜，默认最低浏览量为 10,000，可自行修改；浏览量未知的推文保留。有新数据达到要求时会恢复显示。关闭过滤或取消当前范围会恢复原来的内容，不删除推文。
- **生效范围和贴边隐藏**：首页／推荐流、列表、个人主页和推文详情分别开关；不适用的页面不显示热榜。取消当前页面后，可从工具栏弹窗进入“热度榜设置”重新开启。点击标题栏新增的“靠边收起”按钮，会自动滑向最近的左侧或右侧；开启贴边隐藏后，把窗口拖到左右边缘松手也会收起。悬停、聚焦或点击边缘标签可临时展开，移开后重新收起。直接把收起的标签拖到页面任意位置即可恢复悬浮，窄窗口也适用。位置和贴边状态会保留。收起与展开连续滑动、渐隐渐现，拖动时立即跟手；系统开启减少动态效果时停用动画。
- **图片**：点击推文照片打开。滚轮缩放，拖动平移，双击切换原始比例与适应窗口；`+`、`-`、`0`、`Esc` 可用。长图以 900px 为目标宽度，不超出窗口。
- **复制**：打开原来的分享菜单，选择“复制为 Markdown”。剪贴板不可用时显示手动复制窗口。只有截断正文时会标注不完整。
- **星图**：点击推文旁的连线图标。可搜索、筛选，切换人物列表与引用河流；每次操作只加载一页。顶部原帖作者和列表人物显示头像，点击头像打开主页；列表中的姓名按钮用于在星图中定位人物。
- **AI 评论**：工具栏弹窗 → AI 评论，可选 X Grok、OpenAI 兼容服务或本机 Ollama，设置评论数量（1–30）、新增／修改／删除模板及临时对话。外部服务需要填写地址和模型并授权；OpenAI 兼容服务还需填写密钥，密钥不随备份导出。生成后选择一条评论，可编辑后复制或填入回复框。
- **Grok**：点击推文旁的星形图标。先检查所选正文与提示词，再主动生成。可复制或填入已打开的对应回复框，不自动发布。

### 工具栏扩展弹窗

点击浏览器工具栏的 Xtrend，打开过滤、流速榜、监控、外观、AI 评论和关于六个分区。右上角可切换语言、明暗模式或打开通用设置。没有试用期或付费锁。

- **内容屏蔽**：只处理详情页原推文下方、有明确回复关系的评论。宽松／标准／严格分别随附 1／23／26 条短语规则；白名单先于黑名单和规则。可逐条停用规则、增删改自定义规则，或导入本地文件。首页、搜索、个人主页和原推文不受这项过滤影响；“仅看热帖”是独立开关。
- **规则试用**：在过滤分区输入示例回复和作者，查看当前未保存的表单规则会如何判断；试用不会修改真实页面或已保存的规则。
- **规则文件**：规则随安装包更新，不联网下载。导入版本 1 的 JSON，最多 100 条、100KB，普通文字短语不执行代码。可导出导入及自定义规则；导出不包含设备标识或监控记录。
- **自定义色卡**：四个预设，最多 12 张自定义色卡，分别调整底色、文字色和强调色。保存后应用到弹窗、热榜、徽章和连接线；深色自动适配。颜色过于接近时会提示调整。
- **私有热帖监控**：填写账号或关键词和最低浏览量／平均流速后保存并开启。账号或关键词任一个命中，再同时满足两个数值门槛才记录；门槛设为 0 表示不限制该项。只处理浏览时已看到的内容，不额外刷新 X，也不会在关页后继续巡回。
- **Bark**：在监控分区填写服务器基础地址与设备标识，点击授权并启用。只发送作者、命中原因、数量、原文链接，不发送正文。先发送测试通知，再检查手机。服务器接受不等于手机送达。每分钟最多 5 条，超出仅记录，可手动重试；旧记录不会自动补发。
- **监控记录与再次提醒**：仅本机保留最近 30 天、最多 200 条，可一键清除。默认不重复推送；可选择浏览量增长 25%、50% 或 100% 后再次提醒，至少间隔五分钟且需要新的准确读数。仍遵守安静时段、发送间隔和每分钟次数限制。

规则文件示例：

```json
{"version":1,"rules":[{"id":"my-promo","label":"自定义推广","terms":["示例推广短语"],"match":"any","severity":2,"enabled":true}]}
```

`severity` 3 表示宽松起生效、2 表示标准起、1 表示仅严格；`match` 可为 `any` 或 `all`。

### 星图与 Grok 的连接

打开星图后自动读取一页转发者；切换引用时读取引用列表。人物列表、搜索和分类筛选处理已加载结果。只有点击“下一页”才继续加载。星图只反映 X 公开返回的数据，并不代表完整传播关系。

无需提前手动建立 Grok 对话。检查提示词后点击生成，插件临时打开后台标签页中的 X 原生 Grok 页面，由 X 自己完成发送并将回复带回助手。提示词交给 X/Grok 处理，普通对话可能保留在其历史中。插件不复制登录资料，也不把旧对话或附件带入新请求。勾选临时聊天后，插件先确认 X 的私密提示；无法确认会停止发送。

阅读页面不会跳转。取消或生成结束后关闭临时 Grok 标签页；转发／引用标签页保留供后续翻页，读完最后一页、切换账号、离开阅读页面或过期后关闭。重新打开浏览器后如需继续旧缓存的下一页，请先点击刷新。

如果 X 要求重新登录、达到使用上限或页面没有完成加载，会显示失败原因。扩展更新后，必须刷新已经打开的 X 标签页；只重新加载扩展无法更新旧页面里的功能。

## 收藏与资料整理

1. 点击帖子旁的收藏按钮，填写标签和备注后保存。也可从热榜底部的收藏入口或工具栏弹窗“关于”打开收藏夹。
2. 搜索正文、作者、标签或备注；点击标签筛选，长正文可展开。编辑标签与备注后点击保存，标签使用英文或中文逗号分隔。
3. 取消或关闭未保存的编辑时，可选择继续编辑或放弃；移除收藏需要再次确认。直接关闭浏览器工具栏弹窗仍可能丢失未保存输入。
4. 使用“导出收藏”下载 JSON；在另一份本地收藏夹中选择该文件，先查看新增数量，再确认导入。已有收藏和备注优先保留；重复编号、损坏文件或超出容量时拒绝导入，不写入部分结果。

收藏最多 **100 条／2MB**，每条最多 10 个标签、每个标签 30 个字符、备注 2,000 个字符；导入文件不超过 3MB。收藏仅保存在当前浏览器的扩展存储中，在本机 X 账号间共享，不等同于 X 自带的书签，也不自动同步到其他设备。设置备份不包含收藏，请单独导出。

- **本页搜索**：热榜按正文、作者和最早发布日期筛选，只处理当前已读取内容，不执行全站搜索。
- **阅读场景**：热榜设置和弹窗流速榜分区提供日常阅读、资料收集、重点热帖三种预设，只调整阅读显示，不自动启用监控或通知。
- **批量导出**：热榜底部“选择并导出”可勾选当前分组的已读取帖子，最多 200 条；复制／下载 Markdown，或下载 CSV 表格。表格包含作者、正文、发布时间、浏览量、平均速度、读取时间和原文链接，外部文字按普通文字处理。

## 其他设置与操作

- **本机自检与备份**：工具栏弹窗 → 关于。自检显示已读数量、最近收到数据、连接是否观察到、本地空间和监控状态，不额外请求 X。导出检查结果不包含凭据、正文、账号名或推文链接。备份包含设置、规则、色卡、模板和名单；不包含 AI 密钥、Bark 设备标识、收藏、缓存或命中记录。导入后先预览，确认恢复后监控与 Bark 均关闭。
- **屏蔽原因与恢复**：热榜底部“查看屏蔽记录”，可查看原因、本页临时显示或加入作者白名单。即使关闭热榜，也有独立恢复入口。临时恢复随页面切换清除，不修改原推文。
- **数据新鲜度与趋势**：徽章提示显示最后读数和增长观察区间；超过五分钟没有新读数会提示。推文旁的趋势按钮只画已取得的读数，每条最多 60 点，关闭页面或切换时间线清除，不自动刷新以补点。
- **通知控制**：监控分区可设置安静时段（本机时区，开始和结束相同表示不限制）、合并等待 0–60 分钟、两次发送间隔 0–1,440 分钟。安静时段命中先本地排队，结束后最多每组 10 条发送；长通知会截短。发送失败等待 30 秒，所有尝试包括测试、重试合计每分钟最多 5 次。浏览器关闭时不发送，重新运行后处理待发项；停用 Bark 后待发项不会自动补发。
- **单独监控门槛**：监控条件表单可填写 `account | handle | 最低浏览量 | 最低浏览/小时` 或 `keyword | 关键词 | 最低浏览量 | 最低浏览/小时`，每行一项。单独目标门槛优先于共同门槛；账号与关键词仍是“任一命中”。保存后才生效。
- **Pro 按列操作**：在多列页面的热榜选择列，再打开热榜设置，可保存当前列的条数、最低浏览量和是否监控。最低浏览量在“仅看热帖”开启时使用；全部列模式仍使用全局条数。列规则对应显示顺序，重排列后需核对；真实 X Pro 需要相应账号权限。
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
| `src/core/` | 设置校验、排名、过滤、指标、缓存、备份、Markdown／CSV、收藏、AI 配置和监控。 |
| `src/ui/` | 徽章、热榜、图片阅读器、星图、收藏夹、AI 评论助手、设置与监控面板。 |
| `src/platform/` | 浏览器本机存储、设置同步、外部 AI 请求、后台通知和临时标签页。 |
| `preview/`、`tests/`、`scripts/` | 合成数据预览、自动检查与交付辅助；预览数据不会装入正式扩展。 |

基本运行流程：X 页面出现内容 → 页面读取层提取受支持字段 → 内容模型校验并整理 → 核心逻辑计算徽章、排序或过滤结果 → 界面显示。用户主动加载星图、图片或生成评论时连接相应服务；启用 Bark 后按已保存的监控与通知条件发送。页面脚本不能绕过扩展按钮发起后台草稿操作。

更多实现说明见[架构说明](docs/架构说明.md)；当前版本的检查范围和限制见[验证记录](docs/VERIFICATION.md)。

## 本地保存与联网

不设置服务器、不加入统计、广告、追踪或远程代码。字体和图标随扩展附带。

本机保存设置、提示词模板、过滤规则、色卡、AI 密钥、Bark 设备标识、手动收藏、监控命中记录与按账号分开的星图缓存。星图缓存七天过期，总量不超过 5MB，包含 X 返回的头像地址；监控记录保留 30 天、最多 200 条且不含正文。匿名状态下不保存星图。回复草稿与速度采样只在页面内存中。

星图头像从 X 官方图片服务器加载，不使用第三方头像服务。Grok 将提示词交给 X；OpenAI 兼容服务或 Ollama 将所选正文及提示词发往配置的服务地址，其保留方式取决于该服务。密钥单独保存在本机，不随设置备份导出。收藏导入只在本机处理，导出文件包含已保存正文、作者、标签与备注。[隐私说明](PRIVACY.md)

Bark 默认关闭。启用并授权后，命中通知和手动测试会连接你指定的 Bark 服务器；其处理方式适用该服务器及手机通知服务自身政策。

## 开发和复查

### 环境

- Node.js 22.12 或更新的 22.x，或 Node.js 24。
- npm（随 Node.js 安装）。
- Python 3：完整交付命令使用 `python3` 生成源码 ZIP。
- Chromium、Firefox 浏览器仅在运行浏览器交互检查时需要；Playwright 浏览器可按下方命令安装。
- 使用扩展功能需要 X 的受支持页面与相应账号权限。Grok、Pro、Bark 等可选功能另受 X、浏览器或通知服务的访问限制。

### 完整检查与打包

```sh
npm ci
npx playwright install chromium firefox
npm run verify:release
```

`verify:release` 会检查格式、类型、依赖安全、功能与边界、三个浏览器构建、页面交互和 Firefox 临时安装，并自动准备需要的本地预览。结果保存在 `test-results/`；这些文件不提交到 Git。

需要交付包时运行下方命令。它会重新执行完整检查，再生成三个浏览器 ZIP、源码 ZIP、说明、检查记录和 `SHA256SUMS.txt`：

```sh
npm run release
```

### 单项检查与界面预览

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动扩展开发模式。 |
| `npm run format:check`、`npm run check`、`npm run audit`、`npm test` | 分别检查格式、类型、依赖与功能。 |
| `npm run build` | 构建 Chrome 到 `.output/chrome-mv3/`。 |
| `npm run build:all` | 构建 Chrome、Edge、Firefox。 |
| `npm run zip:all` | 生成 `.output/` 中的浏览器 ZIP，不代替完整交付检查。 |

单独运行浏览器交互检查时，需要固定端口的预览。在另一个终端启动：

```sh
npm run preview -- --port 5179 --strictPort
```

然后在项目目录运行（首次需要安装上面的 Playwright 浏览器）：

```sh
npm run build:all
npm run test:browser
```

`preview/` 是明确标识的合成数据验证页，不会连接 X，不会包含在浏览器安装包中。它不证明真实 X 或 Grok 当前可用。

GitHub 的[自动检查配置](.github/workflows/verify.yml)在推送、合并请求或手动触发后运行同一套完整检查；是否通过以[对应提交的运行记录](https://github.com/koshou9/Xtrend/actions/workflows/verify.yml)为准。WXT 命令参考[官方文档](https://wxt.dev/guide/installation)。

## 验证范围与已知限制

0.3.3 的检查记录为 **160 项功能与边界检查、119 项浏览器检查**，包括 6 项 AI 服务与模板操作检查；三种浏览器构建和 Firefox 临时安装通过。详细范围见[验证记录](docs/VERIFICATION.md)。

- 自动检查使用隔离的构造页面和本机测试服务，不使用真实账号或外部服务密钥，不自动发布评论。
- 当前版本的真实 X／Grok、X Pro、Edge／Firefox 账号流程和 Bark 手机送达仍需分别验收，不能沿用 0.2.9 的历史结果。
- Firefox 检查为 0 项错误、6 项提示，涉及旧版授权支持和第三方界面代码，不代表零提示。
- Firefox 永久安装需要 Mozilla 签名；浏览器商店发布与自动更新不包含在本地打包步骤内。Safari 和移动浏览器不在本次交付范围。
- 更新扩展后刷新所有已打开的 X 页面；星图结果受 X 当前返回范围限制，监控不会在后台巡回刷新 X。

更多内容：[架构与难点](docs/架构说明.md)、[变更记录](CHANGELOG.md)、[第三方许可](THIRD_PARTY_NOTICES.md)。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。第三方依赖及随附组件的许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

<a id="english"></a>

# Xtrend — English

[回到中文版](#xtrend)

Xtrend is a local reading workspace for X. It adds reading, ranking, filtering, and drafting tools to supported X pages. It runs as a browser extension for Chrome, Edge, and Firefox, and does not require an Xtrend server.

**Current source version: 0.3.3.** This repository contains source code; generated installation packages and local verification output are not committed. Build the extension locally, or use an installation ZIP supplied separately. See the [changelog](CHANGELOG.md) and [verification record](docs/VERIFICATION.md).

## What it does

- **Reading-speed badges:** Shows post view counts, average views per hour, observed growth, and freshness when the page provides accurate readings.
- **Page rankings:** Ranks posts already seen on the current page, supports text/author/date search, reading presets, configurable fields and thresholds, and lets you jump to a post and return to your previous reading position. Presets do not enable monitoring or notifications.
- **Saved posts:** Manually saves posts with tags and notes. Search the text, author, tags, or notes; filter by tag, expand full text, edit, export, or preview a merge import. Existing saved posts and notes take priority. The library holds up to 100 posts / 2MB, is shared across local X accounts, and is separate from settings backups and X bookmarks.
- **Hot-post filtering:** Filters the timeline and ranking by a minimum view count. Posts with unknown counts remain visible; filtering does not delete posts.
- **Comment filtering:** Applies local allowlists, blocklists, and phrase rules to replies with a clear reply relationship on a post detail page. Rules can be customized or imported from a local JSON file; the rule trial tests unsaved rules without changing the page.
- **Image reader:** Opens post images with zoom and pan controls, including a tall-image reading layout.
- **Markdown and CSV export:** Copies a post as Markdown and exports up to 200 selected, already loaded posts as Markdown or a CSV spreadsheet, keeping external text literal.
- **Repost and quote map:** Browses X-returned repost and quote results, with search, filtering, pagination, and a quote river. The original author and list entries show X-hosted avatars; click an avatar to open a profile or a list name to locate that person on the map. Missing or failed images use a text fallback. Reopening or refreshing updates profiles; results may be incomplete.
- **AI reply drafts:** Choose X Grok, an OpenAI-compatible service, or Ollama. Configure 1–30 replies and manage templates, then choose, edit, copy, or insert a draft into the matching reply box. Nothing is published automatically. Private Grok generation stops if private mode cannot be confirmed.
- **Private monitoring:** Watches only posts encountered while browsing and records local matches. Repeat alerts are off by default; optionally require 25%, 50%, or 100% more views, a new exact reading, and at least five minutes between matches.
- **Optional Bark notifications:** Sends limited match details to a user-configured Bark server after explicit setup and authorization. Bark is off by default.
- **Appearance and settings:** Supports English, Simplified Chinese, and Japanese; light, dark, or system themes; custom palettes; settings backup; and local diagnostics.

## Install the extension

No Node.js setup is needed to install a packaged extension.

For a source checkout, run `npm ci` and `npm run build`, then load `.output/chrome-mv3/` in Chrome. `npm run build:all` also creates `.output/edge-mv3/` and `.output/firefox-mv3/`. The complete release command generates browser and source ZIPs, installation notes, verification output, and checksums in `release/0.3.3/`.

### Chrome and Edge

1. Unzip the matching browser package from `release/0.3.3/`.
2. Open the browser's extensions management page and enable Developer mode.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Refresh open X tabs, then pin Xtrend to the browser toolbar.

To upgrade, replace the previously loaded folder with the new files and reload the extension from its management page. Avoid loading two copies at once.

### Firefox

1. Unzip the Firefox package.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on** and choose the package's `manifest.json`.

Temporary add-ons must be loaded again after Firefox restarts. A permanently installable release requires Mozilla signing. The minimum browser versions are Chrome/Edge 111 and Firefox 128. Bark and external AI services require Firefox 140 or newer and separate website-content and server permissions. Safari and mobile browsers are outside this release's scope.

## Basic use

1. Open or refresh a supported page at `https://x.com/` or `https://pro.x.com/`.
2. Read the badges next to posts and open the floating ranking to sort posts already seen on the page.
3. Open Xtrend from the browser toolbar to configure filters, ranking, monitoring, appearance, AI drafts, and other settings.
4. Use a post's image, Markdown, map, saved-post, or AI controls when needed. External AI services need an endpoint and model; OpenAI-compatible services also require a key. Review the selected text, prompt, and draft before copying or placing it in a reply box.
5. For monitoring, configure a target and thresholds in the Monitoring section. Enable Bark separately only if notifications are wanted.
6. Open saved posts from a post, the ranking footer, or the popup's About section. Save tags and notes before leaving. Imports accept exported JSON up to 3MB, show a preview, and add only new entries; invalid or oversized imports leave the library unchanged. Each entry accepts up to 10 tags of 30 characters and a note of 2,000 characters.

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
| `src/core/` | Shared logic for settings, rankings, filtering, metrics, caching, backup, Markdown/CSV, saved posts, AI configuration, and monitoring. |
| `src/ui/` | Badges, rankings, image reader, map, saved posts, AI draft assistant, settings, and monitoring views. |
| `src/platform/` | Browser storage, settings synchronization, external AI requests, background notifications, and temporary tabs. |
| `preview/`, `tests/`, `scripts/` | Synthetic-data preview, automated checks, and release helpers. Preview fixtures are excluded from browser packages. |

For more detail, read the [architecture notes](docs/ARCHITECTURE.md). Xtrend has no analytics, advertising, tracking, or remote code. Map, image, and Grok actions contact X; visible avatars load from X image servers. Other AI providers receive the selected text and prompt at the configured endpoint; enabled Bark notifications contact the configured server. AI keys remain local and are excluded from settings backups. Saved-post imports are processed locally; exports contain saved text, authors, tags, and notes. See the [privacy notes](PRIVACY.md).

## Development prerequisites and commands

- Node.js 22.12+ (22.x) or Node.js 24.
- npm.
- Python 3, available as `python3`, for the complete source archive step.
- Install Playwright browsers only if running browser interaction checks.

```sh
npm ci
npx playwright install chromium firefox
npm run verify:release
```

`verify:release` runs formatting, type, dependency, unit, build, browser interaction, and Firefox installation checks, preparing the preview automatically. Run `npm run release` to repeat verification and create the complete distribution in `release/0.3.3/`. Results in `test-results/` are local output, not repository files.

For individual browser interaction checks, start `npm run preview -- --port 5179 --strictPort` in a separate terminal, then run:

```sh
npm run build:all
npm run test:browser
```

The preview uses synthetic data, does not connect to X, and is not included in the extension packages. It does not establish that live X, Grok, Edge, Firefox accounts, or Bark delivery work. See the [verification record](docs/VERIFICATION.md) for the current scope.

The 0.3.3 verification records 160 unit/boundary checks and 119 browser checks, including six AI checks, plus all three builds and Firefox temporary installation. Firefox lint reports zero errors and six known warnings. Real-account flows, phone delivery, store publication, and permanent Firefox signing require separate verification. GitHub runs the same checks on pushes and pull requests; consult the [run for the relevant commit](https://github.com/koshou9/Xtrend/actions/workflows/verify.yml).

## License

Xtrend is distributed under the [MIT License](LICENSE). Third-party notices are available in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
