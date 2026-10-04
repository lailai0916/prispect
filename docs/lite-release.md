# Lite 发布交接

## Hermes 结构与蓝白玻璃 Lite

最新 Lite 保留用户认可的「财务、公开事项、口碑线索、原文」四个样例结构，沿其玻璃面板、细网格与蓝白风格延伸搜索和独立报告页面；补充短入场、标签切换、指针高光、卡片与原生详情动效。Pro 报告结构保留，团队并行更新的共享助手已正常合并。

完整代码检查通过 1086 项测试；最终类型、格式与构建通过。入口浏览器验收 90 项／39 张图、完整报告 21 项／10 张图、最终呈现复验 7 项／3 张图通过，保留精确金额、同代出处与完整打印。字体清晰度另有 33 个实际文字样本；完整边界见 [design-qa.md](../design-qa.md)。

两张未完成入场的阅读指南截图已保留并替换为稳定截图，补验 4 项通过。最后修复 Lite 桌面悬浮助手遮住页脚条款的问题；1440、1024、441、390px 的 12 次真实链接点击及 8 项检查通过，未改报告逻辑或 Pro 布局。

本轮仍通过最新 main 的精确提交 CI → Deploy 发布，生产完成以 HTTPS 健康接口的精确 release SHA 和发布后的只读浏览器回执为准。既有 AI 综合分析超时未因这次展示改造而修复。

## 现行软件参考版与收尾

Lite 已按八个软件参赛作品的真实交互重做为搜索主场与线索阅读体验；三款游戏不参与新设计。`30f526b09d7eeca7ea5d8b8945d76dc0d22c0491` 已通过 [CI 37151361495](https://github.com/lailai0916/prispect/actions/runs/37151361495) 与 [Deploy 37151658315](https://github.com/lailai0916/prispect/actions/runs/37151658315)。严格 HTTPS 健康版本匹配，存储正常，19项生产只读检查通过，6张真实截图保留。

随后收尾修复了所选年度交接、窄屏菜单与助手触控、断网提示、报告首屏真实状态、巨量指标来源的渐进展开和减少动效的阅读位置。指南已区分 Lite 与 Pro；Pro 的专业布局沿用。模型侧减少同源原文的重复传输，保留完整出处与原有预算。

真实生产查询已取得财务数据，但这次自动综合分析超时，保存的是规则报告，不能据此声称 AI 正文生成成功。取舍和逐项验收见 [design-qa.md](../design-qa.md)。后续修复仍须以各自提交的 CI → Deploy → 生产精确版本核验完成，最新版本以健康接口 `X-Prispect-Release` 为准。

## 较早发布记录

本次发布分支是 `lite-release`，直接基于线上 `896e079f5c12e9a38a086855f8c7513172a20dce`。其中 `b2eda30` 是 Lite 初版，后续提交补上动效复位、章节阅读、失败状态和窄屏细节。Pro 保留恢复后的原专业布局。

2026-10-04 执行环境恢复网络与 socket 能力后，`80be65c2ec47637810746f24e2d27a25f2668b4f` 已成功推送 main 并正式发布。此前的 `EPERM` 与 GitHub 工具写入限制是旧环境阻塞，现已通过具备权限的正常 Git 推送完成发布，无须用户再次确认授权。

- [CI 37144654321](https://github.com/lailai0916/prispect/actions/runs/37144654321)：success。
- [Deploy 37144944880](https://github.com/lailai0916/prispect/actions/runs/37144944880)：success。
- 严格 HTTPS `https://prispect.com/api/health`：200、`{"ok":true}`；`X-Prispect-Release` 精确匹配该提交，`X-Prispect-Storage: healthy`。

后续浏览器实测修补了桌面及 320px 英文标题裁切和中文按钮换行，并扩充了 CI 几何检查。当前线上完整 SHA 以健康接口的 `X-Prispect-Release` 为准；发布始终由同一精确提交的 main CI 成功触发。

## 彩色光学新版

用户随后授权放开配色，并要求深度体验参考作品。本轮首页与 Lite 阅读页改为完整的光学场景：原创折射棱镜、炭黑／荧光绿巨字、实时本地光轨、原生滚动转场、真实年报第 190／191 页的扫描分界、全屏菜单与贴近所选步骤的手机预览。Pro 的专业报告与侧栏保持原方案。

四个参考站已实际重新浏览并保存截图及录屏；访问边界记录在本地 `output/reference-review/v2-jiejoe/` 与 `v2-teams/`。财务样例与查询结果、源文和装饰素材始终分开。新的资产记录见 `public/showcase/SOURCES.md`，完整设计走查见 [design-qa.md](../design-qa.md)。

彩色新版继续通过 main 的精确提交 CI → Deploy 发布，不能用原版的上线记录代替本轮验收。实际部署 SHA 由生产 HTTPS 健康接口返回，发布后的浏览器证据保存在 `output/browser-qa/production/receipt.json`。

## 在具备网络与 GitHub 写入能力的工作区发布

仓库现有工作流会在 main 对应提交的 CI 成功后部署至 `https://prispect.com`。CI 包括完整代码检查与新增的真实入口浏览器验收；部署还检查最新 main 的提交和生产 HTTPS 健康状态。

在已有仓库中直接推送已准备的分支：

```bash
git fetch origin main
git diff origin/main lite-release
git push origin lite-release:main
```

若使用 `/workspace/prispect-lite-release.bundle` 交接，在本地 Prispect 仓库中将该包放在当前目录，再执行：

```bash
git fetch origin main
git bundle verify ./prispect-lite-release.bundle
git fetch ./prispect-lite-release.bundle refs/heads/lite-release:refs/heads/lite-release-preview
git log --oneline origin/main..lite-release-preview
git diff origin/main lite-release-preview
git push origin lite-release-preview:main
```

推送使用普通快进更新。如果远端 main 已出现其他提交，应先整合并重新检查，不使用强制推送覆盖团队工作。

## 验证范围

按原锁文件重新安装依赖后，完整 `npm run check` 通过：类型检查、研究记录、1005 项测试、构建和全仓格式。完整开发测试需 Node 22.15+，生产运行的最低版本保持 Node 22.12。

原版真实入口浏览器验收通过 35 项检查和九张截图；彩色新版扩充为 48 项检查与 21 张截图，另验收光轨响应、输入暂停、静态降级、扫描键盘操作和步骤素材切换。另以真实公开来源完成一次松原安全 2025 研究，核对精确金额、来源、章节、窄屏，以及同一记录切换不创建研究或追加采集。两个走查均使用独立临时访客数据；没有触碰生产记录，没有财务假数据。视觉比较与修补证据见 [design-qa.md](../design-qa.md)。没有配置或调用在线模型，不能用入口或结果阅读验收代替真实模型回答验证。
