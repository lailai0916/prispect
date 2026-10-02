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

| 路径                                       | 要求                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| /usr/local/sbin/cashlens-ci-dispatch       | 由 deploy/ci-dispatch.sh 安装；root:root，0755，不允许部署用户修改                |
| /usr/local/sbin/cashlens-ci-deploy         | 由 deploy/ci-deploy.sh 安装；root:root，0755，不允许部署用户修改                  |
| /usr/local/sbin/cashlens-backup            | 预装已审查的 deploy/backup.sh；root:root，0755                                    |
| /usr/local/sbin/cashlens-healthcheck       | 预装已审查的 deploy/healthcheck.sh；root:root，0755                               |
| /usr/local/sbin/cashlens-prune-deployments | 预装已审查的 deploy/prune-deployments.py；root:root，0755；固定范围的部署文件清理 |
| /opt/cashlens/releases                     | root 持有，部署用户不可写；服务用户 cashlens 可遍历                               |
| /opt/cashlens/current                      | 指向现有发布目录的 symlink；首次接入前必须已有可回滚版本                          |
| /opt/cashlens/source-data                  | root 持有的真实原件目录；cashlens 可读，不由 CI 包上传                            |
| /var/lib/cashlens-deploy                   | root:root，0755；接收包、安装 staging 和诊断的父目录                              |
| /var/lib/cashlens                          | 现有持久状态，发布脚本不覆盖或删除                                                |
| /etc/cashlens.env                          | 现有服务环境，发布脚本不读取、替换或输出                                          |

服务器需要 Linux、Bash、Python 3.11 或以上、GNU coreutils、flock、curl、sudo、systemd，以及 /usr/local/bin/node 和 /usr/local/bin/npm。清理 helper 使用基于目录文件描述符的 `shutil.rmtree(dir_fd=...)`，要求运行时支持防软链接攻击的实现；安装进程检查要求 systemd 使用 cgroup v2，固定 `/sys/fs/cgroup/cgroup.controllers` 为可信可读的普通文件，并从 `/sys/fs/cgroup/system.slice` 检查安装 unit 的进程。缺少该运行时支持时安全拒绝清理，应先确认系统配置，不能绕过检查删除文件。Node 使用 22.12 或以上；better-sqlite3 安装必须允许原生依赖脚本。CI runner 自带 Python 3.11 或以上，用于打包摘要计算。

两个维护 service 的 ExecStart 必须分别是 /usr/local/sbin/cashlens-backup 与 /usr/local/sbin/cashlens-healthcheck；迁移后执行 daemon-reload，并核对 systemctl show。不能保留指向 current/deploy/backup.sh 的 root 维护入口，否则收到的归档可能通过定时器变成 root 执行代码。publisher 会在接收前核对此前置条件，归档中的 deploy 脚本只当源码保存。

部署留存更新需要通过既有管理身份预装新版 publisher 与清理 helper。仓库文件更新或 CI 归档到达不会替换这些 root 入口；publisher 会预检清理 helper 的属主、执行权限与类型，缺少正确预装文件时拒绝发布。安装步骤见下方“部署文件留存与管理更新”。

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
3. publisher 持有部署锁，在接收前调用预装清理 helper 处理历史 job 与旧 release，并保护本轮目标和原 current。接收上限 100 MiB、120 秒，核对 SHA-256。归档最多 30000 成员、展开内容 256 MiB；拒绝绝对路径、路径穿越、重复路径、控制字符、链接、设备、FIFO及排除路径。手工解包，不采纳归档 owner 或 setuid 权限，核对 RELEASE.json 和必需运行文件。
4. 安装前将原始文件类型、SHA-256 和执行位保存到 root-only manifest。npm ci --omit=dev 在独立 transient systemd unit 以 cashlens-deploy 运行；NoNewPrivileges 阻止 sudo，ProtectSystem=strict，仅本次安装目录及 npm-home 可写，KillMode=control-group、RuntimeMaxSec 限制安装。
5. 等安装 unit 完全停止后收回 staging 所有权，逐项核对归档源码/dist，拒绝 node_modules 外新增、缺失或变更。依赖目录只允许不逃出安装树的相对软链接；普通文件硬链接只有全部名称都在安装树中才允许，并复制成独立文件。归档硬链接始终拒绝。再复制到全新 root 持有目录；不发布原安装 staging，避免仍打开的安装文件描述符参与切换。
6. 新目录封存为 root:cashlens，目录和可执行文件 0750、普通文件 0640；加入指向预装 source-data 的唯一原件链接。移动到 releases/完整SHA；确认安装 unit 停止且子进程已退出、收回 staging 所有权后，立即清理本次 install、npm-home、归档、sealed 残留及 served-asset，避免把重复安装文件带入后续磁盘健康判定。
7. 调用预装的一致性备份 helper，完成后原子切换 current，重启服务。最多 12 次健康检查；除 API、磁盘检查，还逐字节比较正在提供的首页及 HTML 所引用资源与新 dist，不能用仅 HTTP 200 冒充新构建已经运行。
8. 通过本机健康与构建资产检查后，以 Unix 秒记录 .deployed-at；本轮新建版本失败时记录 .deployment-failed。失败时恢复兼容的旧 current 并重启，保留诊断且返回非零；不自动覆盖持久状态。成功和失败退出都调用清理 helper；无法确认安装进程退出时保留其临时文件。同提交同包已经 current 且健康时幂等返回成功。相同提交包哈希不同则拒绝，需要人工核对。
9. SSH 发布成功后，workflow 用无 cookie 的严格 HTTPS curl 核对 https://prispect.com/api/health。公网检查失败会将 workflow 标为失败；它不另发未经核对的回滚命令。

代码回滚不回滚持久状态。数据格式变更需要旧版本兼容性验收；一致性备份用于明确的恢复操作。部署清理只处理固定发布目录和 job，不删除现有用户状态、原件、环境配置或备份。

## 部署文件留存与管理更新

清理 helper 与 publisher 使用同一部署锁。保留 current 与最近两个可回滚的旧 release：旧版本需具有可信发布清单、未标记本次部署失败，且 AUTH_SCHEMA.json 声明可读取当前认证数据库。新版本按成功检查后的 .deployed-at 排序；旧版本没有该标记时，按有效清单与目录 mtime 保守纳入留存候选，不能据此宣称它已通过启动验收。本轮目标、原 current 和仍有安装 unit 的版本始终受保护，因保护或跳过项可能暂时多于三个目录。

历史 job 保留最近十份诊断，每份日志只保留最后 256 KiB，并保留 exit-status 等诊断 metadata；install、npm-home、sealed、release.tar.gz 和 served-asset 不作为长期诊断保留。活动 job 默认跳过，publisher 仅在确认安装停止后显式清理本轮 job；仍有安装进程的 job 保留。未知命名、路径链接、不可信属主或权限、挂载点及其他文件系统边界均跳过，不扩大删除范围；清理结果的 skipped、warnings 和 cleanup.log 用于管理核对。

此策略不删除或改写 /var/lib/cashlens、/opt/cashlens/source-data、/etc/cashlens.env 或 /var/backups/cashlens；仅只读查询认证迁移版本以判断旧 release 的兼容性。现有数据与备份全部保留，备份留存仍另行管理；85% 磁盘健康阈值保持不变。

以下命令由既有管理身份在服务器上、独立的管理源码目录内执行。先将该目录的 commit 与两文件 SHA-256 对照已审查版本核对；目录和文件应由 root 持有且其他账号不可写。不要从 CI 接收归档或 current 中运行维护脚本，也不要扩大受限部署账号的 SSH 或 sudo 权限。

```bash
git rev-parse HEAD
sha256sum deploy/prune-deployments.py deploy/ci-deploy.sh
```

核对后，持有固定 `/var/lib/cashlens-deploy/deploy.lock`，完成运行时与语法检查，再在 `/usr/local/sbin` 创建 root:root、0755 的临时文件，先原子替换清理 helper，再替换 publisher。更新锁与运行锁是同一把锁，`flock -n` 忙碌时退出；原子替换避免截断正在执行的 Bash 文件。

```bash
sudo bash -s -- "$PWD" <<'SH'
set -euo pipefail
umask 077
reviewed_dir=$1
exec 9>/var/lib/cashlens-deploy/deploy.lock
flock -n 9
python3 - <<'PY'
import os, shutil, stat, sys
assert sys.version_info >= (3, 11)
assert shutil.rmtree.avoids_symlink_attacks
fd = os.open('/sys/fs/cgroup/cgroup.controllers', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
try:
    info = os.fstat(fd)
    assert stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022
    os.read(fd, 65536)
finally:
    os.close(fd)
PY
prune_stage=
publisher_stage=
trap 'rm -f -- "$prune_stage" "$publisher_stage"' EXIT
prune_stage="$(mktemp /usr/local/sbin/.cashlens-prune-deployments.XXXXXX)"
publisher_stage="$(mktemp /usr/local/sbin/.cashlens-ci-deploy.XXXXXX)"
install -o root -g root -m 0755 "$reviewed_dir/deploy/prune-deployments.py" "$prune_stage"
install -o root -g root -m 0755 "$reviewed_dir/deploy/ci-deploy.sh" "$publisher_stage"
python3 - "$prune_stage" <<'PY'
from pathlib import Path
import sys
compile(Path(sys.argv[1]).read_bytes(), sys.argv[1], 'exec')
PY
bash -n "$publisher_stage"
mv -Tf -- "$prune_stage" /usr/local/sbin/cashlens-prune-deployments
mv -Tf -- "$publisher_stage" /usr/local/sbin/cashlens-ci-deploy
stat -c '%U:%G %a %n' /usr/local/sbin/cashlens-prune-deployments /usr/local/sbin/cashlens-ci-deploy
sha256sum /usr/local/sbin/cashlens-prune-deployments /usr/local/sbin/cashlens-ci-deploy
SH
```

核对已安装文件的权限和哈希。上述安装块退出、释放更新锁后，仍由管理身份独立执行固定 helper 清理既有部署文件；它自行取得同一部署锁，忙碌时拒绝执行，无需传入目录或手工删除文件：

```bash
sudo /usr/local/sbin/cashlens-prune-deployments
sudo du -sh /var/lib/cashlens-deploy /opt/cashlens/releases /var/backups/cashlens
sudo /usr/local/sbin/cashlens-healthcheck
```

核对 helper 输出的删除、跳过和警告，以及 current 和服务健康。以上是安装与操作步骤，不是服务器已经安装或已完成清理的验收记录；不读取或输出备份中的配置内容。

## 验收与当前边界

本轮部署留存实现的本地 `npm run check` 已通过类型检查、220 项测试、构建与格式；仓库规范检查及 `--github` 检查通过。该结果包含本地留存测试，不代表服务器上的新 helper 已安装或已清理存量；管理安装、实机 cgroup 运行检查及清理后的容量与健康核对尚待执行。下方既有记录保留各次历史验收范围。

2026-10-02 本地已通过三个脚本 Bash 语法、Prettier YAML 解析及文档格式、工作流多行 shell 语法。临时独立 checkout 验证模板链接兼容、两次包字节及摘要一致、秘密/状态/raw/Git 排除；11 种危险归档与 7 种非法 SSH 命令被拒绝。源码同长度改写、依赖外新增文件、安装后外部链接均被拒绝。CI 记录夹具确认精确 main push success 被接受，错误 SHA、PR、分支、失败/未完成、fork 与无记录被拒绝。没有执行本机 sudo、systemctl、SSH 或真实依赖安装沙箱。

受限身份的非法命令拒绝、npm 沙箱、备份、权限封存、保留账号状态、资产一致与幂等已在真实服务器验收。切换后启动故障回滚尚未在生产注入验证，与实际成功部署分别记录。

2026-10-02 实机入口验证：独立构建已有核心提交 `96fa784cc1c0ad3096c4bce7be6c7301f54aeaf6`，包摘要 `a8d9a51140316ffcee4ae7e6bdba2d118eb93cfc7f49c7482faddc21e85fde99`，专用密钥只允许固定 deploy 命令，`id` 返回64。sshd实际ForceCommand固定，密码与转发禁用，sudo仅固定publisher。两份原件移动至独立source-data后哈希不变，账号状态保留。

首次依赖安装因 esbuild 正常内部硬链接而在封存前拒绝，旧站未切换。补充全树 inode 名称核对后，实际非 root systemd 安装、一致性备份、原子切换、API 及构建资产逐字节校验成功；重复同包返回已 current 且健康。错误包哈希实际拒绝，current 保持不变。没有在生产站注入启动故障来验证切换后的回滚；回滚逻辑经审查，不能把哈希拒绝称为已实际执行代码回滚。

首次 GitHub 自动链路的 [CI 36907501972](https://github.com/lailai0916/prispect/actions/runs/36907501972) 与 [Deploy 36907590434](https://github.com/lailai0916/prispect/actions/runs/36907590434) 均为 success，对应同一 `53983713f8562dd5227ef3243f5ccfc990e4670b`。管理连接只读核对 `/opt/cashlens/current` 和 `RELEASE.json` 均指向该提交，当时旧域名的 `/api/health` 返回 `{"ok":true}`。这次发布证明自动链路；随后产品功能版本须另记录其对应 SHA 与运行验收。

## 新版功能的真实发布

功能提交 `0c3590176760b68f06f6e1163e907e34ee174b5a` 的 [CI 36933840965](https://github.com/lailai0916/prispect/actions/runs/36933840965) 与 [Deploy 36933997877](https://github.com/lailai0916/prispect/actions/runs/36933997877) 均成功，服务器 current/RELEASE.json 一致。严格 HTTPS 下页面与主 JS/CSS 哈希匹配已部署目录；新版决定流与公开 Agent 另行实际运行，详见 acceptance.md。该记录不把旧基础设施发布当作新版产品验收，也不声称跨平台构建字节一致或故障回滚已生产注入。
