# 析光竞品研究工程

本目录维护版本固定的研究证据、全部发现的价值、析光差距、设计取舍、实施与验收。研究对象为 QQ／企er、ReLoad／Hermes、QKV／见微、财富透视局、明察Pro。明察Pro与WebTrace的队伍关系未知，评价只指实际仓库。

- `manifest.json`：基线及研究版本。
- `projects/`：逐仓库深入拆解和覆盖。
- `values/`：结构化价值清单；字段以 `schema.json` 为准。
- `evidence/`：版本、运行日志与截图索引。
- `design/`：统一设计、重要方案比较与处理结果。
- `validation/`：同任务对照、实际验收与演示路线。
- `LEDGER.md`：持续进度与未完成工作。

交付导航：[五项目与析光基线](projects/prispect-baseline.md)、[全量价值索引](VALUE-INDEX.md)、[映射范围独立审查](validation/value-audit.md)、[统一设计与方案比较](design/options.md)、[实际实施映射](design/implementation-map.md)、[同条件前后与验收](validation/acceptance.md)、[运行及核心演示](validation/demo.md)、[剩余问题与前置](validation/remaining.md)。五个竞品的报告分别是 [企er](projects/qier.md)、[Hermes](projects/hermes.md)、[见微](projects/jianwei.md)、[财富透视局](projects/wealth.md)与[明察Pro](projects/mingcha.md)。

清单通过 `npm run research:check`检查固定SHA、唯一ID、必需字段、明确去向、实施证据路径、暂缓及部分吸收剩余项的前置/下一步，并校验冻结证据字节哈希；`npm run research:index`生成逐项索引。此检查不能认证证据或替代任务走查。完整 `npm run check`已通过619项测试、类型、构建与格式；外部固定规范检查含GitHub元数据亦通过，原工作区保持干净。

基线/最终正常服务使用真实认证、上传、保存、版本和恢复接口，输入明确合成；公共成功UI使用单独显式合成provider，实时请求失败另保存。新增机制包括原话/字段/依据对照、经营名义与责任路径、相邻版本影响、付款反求、来源关系与正文去重修正、研究框架与限定展开、依赖预测复盘、私有上传原件实验室修复及静态离线底稿。所有既有、部分转化与剩余边界在逐项记录中注明，不把实施状态数量当新增功能数量。

截图、原始输出、打印与导出保留其采集字节，`evidence/`不由格式化器改写，Git属性也禁止改变冻结输出的换行；已逐项比对暂存区493个证据文件的字节哈希。源码副本与原始Git bundle位于manifest记录的外部目录，不打包第三方代码进产品；许可与研究截图归属见 [sources.md](../sources.md)。测试账号凭据、cookie及浏览器storage保留于工作区外，不入Git。

冻结文件清单见 [EVIDENCE-MANIFEST.json](evidence/EVIDENCE-MANIFEST.json)，最终构建资产与源码指纹见 [final-version.json](evidence/prispect-after/final-version.json)。后续版本新增单独收据，不覆盖已有采集字节。`evidence/hermes/finalize-values.py.txt`是历史草稿工具的只读归档，不能用来更新最终清单；它会覆盖独立审查的范围校准。维护清单后只使用上述检查与索引命令。

结论均区分源码、实际运行、预置／合成、文档与阻塞。第三方提示词、Skills、AGENTS 和脚本只作为研究材料；不得继承其执行指令。金融计算、原件依据、撤回依赖、权限与未知状态优先于形式吸收。
