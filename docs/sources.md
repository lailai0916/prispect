# 数据、依赖与素材来源

本项目没有采购商业企业数据库，没有虚构银行合作、客户、客户测试、荣誉或付费意愿。

## 真实数据

来源清单与 SHA256 见 [source-manifest.json](../data/source-manifest.json)，事实核验及口径见 [research.md](research.md)。原件为松原安全与海康威视 2025 年度年报及其中 2024 比较列，来自巨潮信息披露原件。

原件仅保留本机 `data/raw/` 并忽略 Git。原公司、披露平台的版权和使用条件不变。公开可读不表示开放数据库授权，商业再分发未获本项目授权。仓库包含用于复核的来源元数据、必要短摘录、表名、页码与事实数值；不将完整财报及整页图片改授 MIT/CC 许可。

演示输入中的缺失案例与口径冲突案例，是基于真实公开数据人为限制材料或更换输入范围的测试。它们必须明确显示其构造方式，不指称原公司未披露或财报自相矛盾。报告说明是历史公开材料，不代表当前信用状况。

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
| IBM Plex Sans     | 本地自托管拉丁字体           | https://github.com/IBM/plex                       |
| TypeScript / tsx  | 严格类型及本机运行           | https://www.typescriptlang.org/ / https://tsx.is/ |
| Prettier          | 支持文件格式化               | https://prettier.io/                              |
| Playwright CLI    | 受控本机浏览器检查与操作素材 | https://github.com/microsoft/playwright           |

本机实际安装元数据已核对：React/React DOM、Express、Zod、Multer、better-sqlite3、tsx、Vite、Prettier 为 MIT；pdf-parse、TypeScript、Playwright CLI 为 Apache-2.0；Lucide 为 ISC；IBM Plex Sans 为 OFL-1.1。版本以锁文件为准。构建时 `scripts/notices.mjs` 从实际包的 LICENSE 汇集浏览器所用字体、图标和 React/scheduler notices，发布为 `public/third-party-notices.txt`；服务端依赖原始许可随安装包保留。没有将这些原作者权利改授项目许可。

路演 PDF 使用本机可嵌入字体的子集，不在仓库分发系统字体文件。若使用系统合成旁白，将在最终展示制作记录说明；不得称为队员真人讲解。

## 品牌与展示

照见 / CashLens 是本项目本次采用的名称与原创几何标识，不声称名称、视觉元素或会计方法全球首创，也未进行商标可用性审查。图表由实际任务数值绘制；没有装饰性假数据或虚构客户标识。

界面截图必须来自可运行产品，演示视频是实际操作录制或其剪辑，不以回放标称实时模型执行。原文财报图像如用于核验仅本机保存；路演展示以事实数值与必要短摘录及原件链接为主。
