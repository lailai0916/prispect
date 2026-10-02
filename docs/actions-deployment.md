# GitHub Actions 自动部署

工作流、受限服务器入口、可信主机密钥及仓库 Secrets 已配置。2026-10-02，提交 `53983713f8562dd5227ef3243f5ccfc990e4670b` 已通过真实 main push CI，再由 GitHub 事件自动触发部署；服务器发布清单与该 SHA 一致，公网 HTTPS 健康检查通过。本文不含密钥内容，也不提供通用远程命令入口。

## 发布的提交

Deploy 监听名为 CI 的 workflow_run completed，只接受同仓库 main 的 push 且 conclusion 为 success。手动 workflow_dispatch 也只接受 main。两条路径都通过官方 Actions API核对该完整 SHA 已有成功的 main push CI，并比对当前 origin/main；较早的 CI 延迟完成不能将较新 main 回退。手动运行另执行 npm run check，不能用这一步替代原 CI 门槛。

工作流只有 contents: read 和 actions: read 权限，后者用于查询 CI 记录。部署采用单组 concurrency，cancel-in-progress 为 false；服务器还有独立 flock，不允许并行切换。checkout 选择经过 CI 的完整 head SHA，使用现 CI 的官方 actions/checkout@v7 和 actions/setup-node@v4，不使用第三方 SSH action。[GitHub workflow_run 规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)，[官方工作流运行 API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow)

## GitHub 配置

在本私有仓库配置以下值：

| 类型                | 名称                     | 内容                                                    |
| ------------------- | ------------------------ | ------------------------------------------------------- |
| Repository variable | CASHLENS_HOST            | 189.24.78.154                                           |
| Repository variable | CASHLENS_USER            | cashlens-deploy                                         |
| Repository secret   | CASHLENS_SSH_KEY         | 专用部署私钥；只准连接受限入口                          |
| Repository secret   | CASHLENS_SSH_KNOWN_HOSTS | 从已经信任的服务器连接取得并独立核对的 SSH 主机密钥记录 |

工作流把秘密写入 runner 临时文件，权限为 0600，退出后删除，不启用 set -x。SSH 使用 StrictHostKeyChecking=yes、独立 known_hosts 和 IdentitiesOnly。不能临时用未经核对的 ssh-keyscan 输出建立信任。

## 服务器固定目录和权限

| 路径                                 | 要求                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| /usr/local/sbin/cashlens-ci-dispatch | 由 deploy/ci-dispatch.sh 安装；root:root，0755，不允许部署用户修改 |
| /usr/local/sbin/cashlens-ci-deploy   | 由 deploy/ci-deploy.sh 安装；root:root，0755，不允许部署用户修改   |
| /usr/local/sbin/cashlens-backup      | 预装已审查的 deploy/backup.sh；root:root，0755                     |
| /usr/local/sbin/cashlens-healthcheck | 预装已审查的 deploy/healthcheck.sh；root:root，0755                |
| /opt/cashlens/releases               | root 持有，部署用户不可写；服务用户 cashlens 可遍历                |
| /opt/cashlens/current                | 指向现有发布目录的 symlink；首次接入前必须已有可回滚版本           |
| /opt/cashlens/source-data            | root 持有的真实原件目录；cashlens 可读，不由 CI 包上传             |
| /var/lib/cashlens-deploy             | root:root，0755；接收包、安装 staging 和诊断的父目录               |
| /var/lib/cashlens                    | 现有持久状态，发布脚本不覆盖或删除                                 |
| /etc/cashlens.env                    | 现有服务环境，发布脚本不读取、替换或输出                           |

服务器需要 Linux、Bash、Python 3.9 或以上、GNU coreutils、flock、curl、sudo、systemd，以及 /usr/local/bin/node 和 /usr/local/bin/npm。Node 使用 22.12 或以上；better-sqlite3 安装必须允许原生依赖脚本。CI runner 自带 Python 3.11 或以上，用于打包摘要计算。

两个维护 service 的 ExecStart 必须分别是 /usr/local/sbin/cashlens-backup 与 /usr/local/sbin/cashlens-healthcheck；迁移后执行 daemon-reload，并核对 systemctl show。不能保留指向 current/deploy/backup.sh 的 root 维护入口，否则收到的归档可能通过定时器变成 root 执行代码。publisher 会在接收前核对此前置条件，归档中的 deploy 脚本只当源码保存。

## 专用 SSH 身份

cashlens-deploy 与运行服务的 cashlens 是两个不同账号。部署账号不加入 cashlens 组、不获取持久状态访问权限，没有任意 sudo 权限。现场 AuthorizedKeysFile 采用 /home/cashlens-deploy/.ssh/authorized_keys，由 root 持有和维护，部署用户不能增改授权。sshd 与该文件的实际权限由主任务现场核验，不另建第二份授权文件。

专用公钥行使用如下限制；PUBLIC_KEY 由主任务填入真实专用公钥：

```text
restrict,command="/usr/local/sbin/cashlens-ci-dispatch" ssh-ed25519 PUBLIC_KEY
```

sshd 还应以 Match User cashlens-deploy 固定 ForceCommand 为同一 dispatcher，禁用密码登录、TTY、TCP/Agent/X11 转发和用户启动文件；仅配置公钥。不同发行版选项先用 sshd -t 校验，并保留已经验证的管理连接。

sudoers 专用规则只开放固定 publisher：

```text
Defaults:cashlens-deploy env_reset, !setenv
cashlens-deploy ALL=(root) NOPASSWD: /usr/local/sbin/cashlens-ci-deploy *
```

使用 visudo 检查规则。允许 publisher 参数并不开放 shell：dispatcher 只匹配 deploy、40 位小写提交 SHA、64 位小写包哈希；publisher 再检查参数数目及格式。拒绝附加命令、SCP、SFTP、交互 shell 和任意命令。不能把 sudoers 扩成 bash、systemctl、tar、npm 或 ALL。

## 打包、安装和切换

1. Runner 对精确提交执行 npm ci、重新构建 dist。package-release.sh 要求 HEAD 等于请求 SHA，拒绝已修改的跟踪文件，以 git archive 取得精确源码，再加入本次 dist 和 RELEASE.json。临时归档剔除非运行 .claude 配置，拒绝运行路径链接；不修改原仓库配置。
2. 包不含 Git、node_modules、环境秘密、工作区、持久状态或 data/raw。归档时间、所有者和模式标准化，生成 tar.gz 及独立 SHA-256，SSH stdin 传输。协议仅为 deploy SHA HASH。
3. publisher 接收上限 100 MiB、120 秒，核对 SHA-256。归档最多 30000 成员、展开内容 256 MiB；拒绝绝对路径、路径穿越、重复路径、控制字符、链接、设备、FIFO及排除路径。手工解包，不采纳归档 owner 或 setuid 权限，核对 RELEASE.json 和必需运行文件。
4. 安装前将原始文件类型、SHA-256 和执行位保存到 root-only manifest。npm ci --omit=dev 在独立 transient systemd unit 以 cashlens-deploy 运行；NoNewPrivileges 阻止 sudo，ProtectSystem=strict，仅本次安装目录及 npm-home 可写，KillMode=control-group、RuntimeMaxSec 限制安装。
5. 等安装 unit 完全停止后收回 staging 所有权，逐项核对归档源码/dist，拒绝 node_modules 外新增、缺失或变更。依赖目录只允许不逃出安装树的相对软链接；普通文件硬链接只有全部名称都在安装树中才允许，并复制成独立文件。归档硬链接始终拒绝。再复制到全新 root 持有目录；不发布原安装 staging，避免仍打开的安装文件描述符参与切换。
6. 新目录封存为 root:cashlens，目录和可执行文件 0750、普通文件 0640；加入指向预装 source-data 的唯一原件链接。移动到 releases/完整SHA，保留旧 release。
7. 调用预装的一致性备份 helper，完成后原子切换 current，重启服务。最多 12 次健康检查；除 API、磁盘检查，还逐字节比较正在提供的首页及 HTML 所引用资源与新 dist，不能用仅 HTTP 200 冒充新构建已经运行。
8. 失败时恢复旧 current 并重启，保留诊断且返回非零；不自动覆盖持久状态。同提交同包已经 current 且健康时幂等返回成功。相同提交包哈希不同则拒绝，需要人工核对。
9. SSH 发布成功后，workflow 用无 cookie 的严格 HTTPS curl 核对 https://xuejun.cc/api/health。公网检查失败会将 workflow 标为失败；它不另发未经核对的回滚命令。

代码回滚不回滚持久状态。数据格式变更需要旧版本兼容性验收；一致性备份用于明确的恢复操作。publisher 保留每次 job 的包、安装与健康诊断，不自动清理状态、旧 release 或备份；保留策略由管理者按磁盘记录处理。

## 验收与当前边界

2026-10-02 本地已通过三个脚本 Bash 语法、Prettier YAML 解析及文档格式、工作流多行 shell 语法。临时独立 checkout 验证模板链接兼容、两次包字节及摘要一致、秘密/状态/raw/Git 排除；11 种危险归档与 7 种非法 SSH 命令被拒绝。源码同长度改写、依赖外新增文件、安装后外部链接均被拒绝。CI 记录夹具确认精确 main push success 被接受，错误 SHA、PR、分支、失败/未完成、fork 与无记录被拒绝。没有执行本机 sudo、systemctl、SSH 或真实依赖安装沙箱。

受限身份的非法命令拒绝、npm 沙箱、备份、权限封存、保留账号状态、资产一致与幂等已在真实服务器验收。切换后启动故障回滚尚未在生产注入验证，与实际成功部署分别记录。

2026-10-02 实机入口验证：独立构建已有核心提交 `96fa784cc1c0ad3096c4bce7be6c7301f54aeaf6`，包摘要 `a8d9a51140316ffcee4ae7e6bdba2d118eb93cfc7f49c7482faddc21e85fde99`，专用密钥只允许固定 deploy 命令，`id` 返回64。sshd实际ForceCommand固定，密码与转发禁用，sudo仅固定publisher。两份原件移动至独立source-data后哈希不变，账号状态保留。

首次依赖安装因 esbuild 正常内部硬链接而在封存前拒绝，旧站未切换。补充全树 inode 名称核对后，实际非 root systemd 安装、一致性备份、原子切换、API 及构建资产逐字节校验成功；重复同包返回已 current 且健康。错误包哈希实际拒绝，current 保持不变。没有在生产站注入启动故障来验证切换后的回滚；回滚逻辑经审查，不能把哈希拒绝称为已实际执行代码回滚。

首次 GitHub 自动链路的 [CI 36907501972](https://github.com/lailai0916/prispect/actions/runs/36907501972) 与 [Deploy 36907590434](https://github.com/lailai0916/prispect/actions/runs/36907590434) 均为 success，对应同一 `53983713f8562dd5227ef3243f5ccfc990e4670b`。管理连接只读核对 `/opt/cashlens/current` 和 `RELEASE.json` 均指向该提交，`https://xuejun.cc/api/health` 返回 `{"ok":true}`。这次发布证明自动链路；随后产品功能版本须另记录其对应 SHA 与运行验收。

## 新版功能的真实发布

功能提交 `0c3590176760b68f06f6e1163e907e34ee174b5a` 的 [CI 36933840965](https://github.com/lailai0916/prispect/actions/runs/36933840965) 与 [Deploy 36933997877](https://github.com/lailai0916/prispect/actions/runs/36933997877) 均成功，服务器 current/RELEASE.json 一致。严格 HTTPS 下页面与主 JS/CSS 哈希匹配已部署目录；新版决定流与公开 Agent 另行实际运行，详见 acceptance.md。该记录不把旧基础设施发布当作新版产品验收，也不声称跨平台构建字节一致或故障回滚已生产注入。
