# 数据、依赖与素材来源

本项目没有采购商业企业数据库，没有虚构银行合作、客户、客户测试、荣誉或付费意愿。

## 竞品研究材料

2026-10-03 的五仓库研究以 [固定版本清单](competitive-research/manifest.json)和[各项目报告](competitive-research/README.md)为准。完整源码与 Git bundle 在研究工作区外保留，没有将竞品整套代码、字体、角色、图片或Skills作为本项目执行内容或产品素材复制。新机制由析光独立实现。

`docs/competitive-research/evidence/` 的竞品截图与必要摘录只用于指明被评价的实现与交互，其权利属于各项目原作者，项目 MIT 不改授这些第三方作品权利；固定 SHA 与截图来源提供归属。无明确 LICENSE 或声明保留全部权利的项目不做代码/素材复用。明察Pro仓库的MIT及作者归属在其报告记录；它与WebTrace的队伍对应关系未确认。私有测试账号、会话、浏览器storage与实际凭据不入Git；研究数据均明确合成或来自公开企业源。

## 真实数据

来源清单与 SHA256 见 [source-manifest.json](../data/source-manifest.json)，事实核验及口径见 [research.md](research.md)。原件为松原安全与海康威视 2025 年度年报及其中 2024 比较列，来自巨潮信息披露原件。

原件仅保留本机 `data/raw/` 并忽略 Git。原公司、披露平台的版权和使用条件不变。公开可读不表示开放数据库授权，商业再分发未获本项目授权。仓库包含用于复核的来源元数据、必要短摘录、表名、页码与事实数值；不将完整财报及整页图片改授 MIT/CC 许可。

演示输入中的缺失案例与口径冲突案例，是基于真实公开数据人为限制材料或更换输入范围的测试。它们必须明确显示其构造方式，不指称原公司未披露或财报自相矛盾。报告说明是历史公开材料，不代表当前信用状况。

企业查询另使用[东方财富 F10](https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html?type=web&code=SH600519)网页财务字段接口，以最多六年的金额和逐表响应记录支持历史图表。该通道无需第三方账号或 API Key，不等于商业数据授权或稳定服务承诺；没有将这些字段当作已核对的财报原件，也没有改授其数据权利。队友「学军」版本提供了接口和交互思路，源码及取舍见[适配审查](xuejun-teammate-integration.md)；没有复制附件的视觉资产、整套代码或静态企业结论。

## 代码与组件

最终安装版本及完整依赖树以 package-lock.json 为准。依赖保留原始许可证及 notices；本项目的 MIT 不覆盖其原作者权利。

| 依赖              | 作用                         | 上游来源                                          |
| ----------------- | ---------------------------- | ------------------------------------------------- |
| React / React DOM | 多页交互和共享状态           | https://react.dev/                                |
| Vite              | 本机开发与生产构建           | https://vite.dev/                                 |
| Express           | 服务端 API 与同源静态服务    | https://expressjs.com/                            |
| Zod               | 输入验证                     | https://zod.dev/                                  |
| better-sqlite3    | 真实账号与服务端会话持久化   | https://github.com/WiseLibs/better-sqlite3        |
| pdf-parse         | 文本型 PDF 提取              | https://github.com/mehmet-kozan/pdf-parse         |
| Multer            | 限制大小的 multipart 上传    | https://github.com/expressjs/multer               |
| Lucide            | 一致的界面图标               | https://lucide.dev/                               |
| TypeScript / tsx  | 严格类型及本机运行           | https://www.typescriptlang.org/ / https://tsx.is/ |
| Prettier          | 支持文件格式化               | https://prettier.io/                              |
| Playwright CLI    | 受控本机浏览器检查与操作素材 | https://github.com/microsoft/playwright           |

本机实际安装元数据已核对：React/React DOM、Express、Zod、Multer、better-sqlite3、tsx、Vite、Prettier 为 MIT；pdf-parse、TypeScript、Playwright CLI 为 Apache-2.0；Lucide 为 ISC。版本以锁文件为准。构建时 `scripts/notices.mjs` 从实际包的 LICENSE 汇集浏览器所用图标和 React/scheduler notices，发布为 `public/third-party-notices.txt`；服务端依赖原始许可随安装包保留。没有将这些原作者权利改授项目许可。

网站使用设备系统字体，不随应用下载或分发系统字体。路演 PDF 使用本机可嵌入字体的子集，不在仓库分发系统字体文件。若使用系统合成旁白，将在最终展示制作记录说明；不得称为队员真人讲解。

## 品牌与展示

公司／团队名为析光，产品名为析光 / Prispect。产品采用原创几何标识，不声称名称、视觉元素或会计方法全球首创，也未进行商标可用性审查。图表由实际任务数值绘制；没有装饰性假数据或虚构客户标识。

右下角助手以用户提供的新参考图和无嘴 Grok Bot 球设定为形象来源，选用用户指定的第一版四色造型，保留蓝、红、绿、黄四色头发、黑色眼睛、粉色脸颊、黄色月牙呆毛和右侧白色 L 发卡。Image Gen 将裁切的参考头部补全为透明圆球，并以同一图编辑开心闭眼状态；两张图不添加嘴巴、鼻子、身体或四肢，使用相同画布缩放并压缩为透明 WebP。新素材为 `src/assets/assistant-character-rainbow-{idle,happy}.webp`，原白发素材继续保留。参考角色的原作者权利保留，项目许可不改授该角色的第三方权利。全站共用同一个角色入口，展开卡片不重复显示；窄屏沿用预留页面空间的底部入口。角色只提供闲置动作、点击反馈和聊天入口，不表示资料查阅或回答已经成功。

界面截图必须来自可运行产品，演示视频是实际操作录制或其剪辑，不以回放标称实时模型执行。原文财报图像如用于核验仅本机保存；路演展示以事实数值与必要短摘录及原件链接为主。

## 设计资料

按用户指定的 Linear / Apple 方向，实际阅读了 [Linear 2026 界面更新说明](https://linear.app/now/behind-the-latest-design-refresh)、[Apple 界面设计建议](https://developer.apple.com/design/tips/)、[Rauno 交互细节](https://rauno.me/craft/interaction-design)和[图表探索作品](https://rauno.me/craft/graph-slider)，并查看 [Awwwards 数据可视化案例](https://www.awwwards.com/websites/data-visualization/)与 [Lusion 作品](https://lusion.co/)。这些资料用于布局、视觉层级与交互反馈参考；本项目的数据图表、几何标识和界面代码独立实现。

已应用的本地技能为 `apple-design`、`interface-details`、`humanizer-zh`；在线读取并应用 [unslop-ui](https://github.com/yuwen-lu/unslop-ui/blob/main/SKILL.md)的简洁界面检查，也核验了 Anthropic 的 frontend-design 说明。没有把外部 skill 指令作为官方比赛要求。新版验收以实际中英文页面、移动端、键盘与打印结果为准。
