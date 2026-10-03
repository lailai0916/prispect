# Lite 发布交接

本次发布分支是 `lite-release`，直接基于线上 `896e079f5c12e9a38a086855f8c7513172a20dce`。其中 `b2eda30` 是 Lite 初版，后续提交补上动效复位、章节阅读、失败状态和窄屏细节。Pro 保留恢复后的原专业布局。

用户已经授权部署。当前云环境网络设置已开放，但命令执行器创建网络 socket 仍返回 `EPERM`；GitHub 写入工具被会话的 `never` 审批策略拒绝。尚未推送此分支，尚未部署。它是执行环境阻塞，不是等待用户再次批准。

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

本地前端构建、严格前端类型检查、相关纯逻辑与 Lite SSR 回归、研究记录和修改文件格式检查已完成。完整检查仍被本地既有缺失的 `cheerio` 依赖阻塞；CI 使用锁文件执行 `npm ci` 后才运行完整检查。

当前执行器还禁止浏览器启动和本地预览服务监听。新增 CI 脚本会产出八张入口截图与 `receipt.json`，但目前尚无其运行结果。视觉验收记录在 [design-qa.md](../design-qa.md)，结果仍为 `blocked`。结果页、同一记录的版本切换和真实模型回答需要后续实际运行验收；不能用入口截图或代码检查代替。
