# 实施记录

更新：2026-10-31。S0–S4 的实现与独立验证已完成；S5 短验收通过，Token 自然到期长测在刷新认证时网络失败，已退出。S6 的独立候选版已安装到本机 DSH Desktop，已推送公开 MIT 仓库并发布 v0.1.0-rc.1；GitHub CI 和从 GitHub 禁用脚本的安装验证通过，社区 PR #10730 等待仓库满一天及维护者审核。按用户明确的范围，kagent 父 Agent 审批、拒绝转发、页面恢复和平台生命周期仅保留可选记录，不再阻塞本插件。完整测试映射与交付链接见 [验收记录](acceptance.md)，真实能力边界见 [兼容矩阵](compatibility.md)。

| 阶段 | 状态与交付 | 验证与未关闭事项 |
| --- | --- | --- |
| S0 | 完成：固定 Node 24.19.0、npm 11.17.0、DSH 0.2.1-rc.5 和 lockfile；选定独立 Adapter 与 undici/eventsource-parser 单一传输 | 六项复用比较见 ADR 001；实际 cn40 OAuth/SSE/tools 请求形状、公司代理与本地 TLS 契约已验证 |
| S1 | 完成：严格三层配置、不可变快照、Cordis provider/directory 注册、更新与卸载；版本化 tgz | 真实 Loader 与仓库外干净 profile 通过安装、注册、选择、热更新、卸载重装；只使用已发布包的公开入口 |
| S2 | 完成：Token 缓存、单飞、waiter 取消、凭证代次、迟到 401 及 DSH 失败步骤有界恢复 | 本地 OAuth mock 和两种 DSH waterfall 顺序通过；自然到期的真实验收单列在 S5，不以 mock 替代 |
| S3 | 完成：消息、工具 JSON、SSE、usage、replay、错误和请求级取消 | 多字节拆包、交错工具、尾部 usage、失败 usage、缺失 DONE、buffered 拒绝、路由隔离和真实 DSH 工具闭环通过 |
| S4 | 完成：唯一发现与分页、能力校验、分级诊断、示例和运维文档 | config/auth/deployment 无推理；付费诊断显式预算；本地 kind 的 Secret 引用、环境代理、non-root/只读根目录及真实 stream 通过；生产集群与 Secret 轮换未验证 |
| S5 | 短验收通过，S-L07 尚未通过：S-L01、02、03、04、05、06、08 已有真实回归 | 11 次请求验证中文多轮、真实增量、多工具回传、取消后恢复及并发；长测第三 attempt 在 auth 阶段发生 TRANSPORT 错误并退出 |
| S6 | 独立候选版交付完成；社区上架审核中 | 干净打包安装、本地 Desktop、公开源码、Release 和社区投稿已完成；既有 rc.1 tag/归档保持不变。平台联合验收不作为门槛 |

## 当前工作树验证

2026-10-31 汇总执行以下已存在脚本，全部通过；37 项确定性测试无失败、跳过或取消。

| 命令 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| npm run test:unit | 16/16 |
| npm run test:contract | 11/11 |
| npm run test:integration | 10/10 |
| npm run test:pack | 仓库外干净安装、真实 Cordis Loader、可选 Agent 工具闭环及 CLI config 通过 |

打包生成 artifacts/dsh-sap-ai-core-0.1.0-rc.1.tgz 和 artifacts/manifest.json；清单记录 SHA-256、npm integrity、Node/DSH 版本、验证时间和打包文件白名单。公开交付使用 MIT，补齐 dsh.bundle、空配置 patch、预编译 dist 和 GitHub 元数据；官方 DSH 包通过精确版本 peers 提供。test:pack 额外检查 DSH 实际 bundle composition、空配置无网络及禁用安装脚本的加载。GitHub CI 同时校验提交的 dist 与源码一致；远端结果单独记录，不把本机成功等同远端通过。

## 真实验证记录

~~~sh
SAP_AICORE_LIVE=1 npm run test:live:cn40 -- --connection .local/cn40-connection.json
SAP_AICORE_LIVE=1 npm run test:live:expiry -- --connection .local/cn40-connection.json
~~~

短验收于 00:29 首次通过，删除未验证的 in-history system 更新元数据后于 00:43（Asia/Shanghai）再次通过。最终运行源代码/依赖输入 SHA-256 为 317c9f14a12fff83b0218892f93c6e92551444259ced9891b82ef7ab491323de。每轮预算 12 请求，实际 11；每次 max_tokens=128 且 enable_thinking=false。最终已知 usage 为 2131 total / 185 output；被取消请求的 usage 未知。证据在 .local/cn40-live-final-report.json。

本机联合脚本 scripts/test-kagent-live.ts 于 00:48 通过，两个插件均从 tgz 安装，使用 7/8 请求预算；已知 usage 为 8584 total / 92 output。脚本 scripts/test-kubernetes-live.ts 于 00:53 在明确指定的本地 kind context 通过，1/1 请求，67 total / 44 output。各入口与必要参数已同步 README。证据分别为 .local/kagent-joint-report.json 和 .local/kubernetes-live-report.json；临时安装、会话、文件、Namespace 和 Secret 均已清理。kindnet 不执行 NetworkPolicy，此结果不证明网络隔离。

## 自然到期终态与网络恢复

S-L07 于 00:44 启动，首次工具闭环使用两次请求、执行一次工具。2026-10-31 12:45:03（Asia/Shanghai）等待自然到期后恢复，第三 attempt 在 auth 阶段 16 ms 内以 TRANSPORT 失败；进程 exit 1，最终为 failed、3/4 请求，未取得 generation=2。原进程已退出，不能将其表述为仍在等待，也不能用重新创建的会话冒充原长测恢复。证据为 .local/cn40-expiry-report.json。

同期配置的公司代理 DNS 解析失败。使用独立的 proxyMode=direct 配置后，无推理 auth 检查通过；再以桌面配置在项目诊断宿主执行一次 32-output-token 的 stream 检查，收到 11 个真实增量、usage=55，TLS 验证保持开启。本地 desktop profile 的 SAP 网络配置已备份并切换为直连，应用已正常重启；没有修改系统网络。证据为 .local/cn40-network-after-expiry.json、.local/cn40-direct-auth-report.json、.local/cn40-direct-stream-report.json 和 .local/desktop-install/direct-network-update.json。此结果证明当前连接可用，不替代自然到期验收；本轮没有重新启动长测。

独立诊断使用项目宿主提供的 DSH peers。直接用普通 node 执行 desktop 插件目录里的 CLI 会缺少由桌面宿主提供的 @deepseek-ai/cordis；该尝试在网络前退出，没有产生模型请求。不要把它当作桌面宿主加载失败，独立 CLI 的依赖要求见 configuration.md。

随后只读查询 cn40 模型目录和 default 资源组的完整部署列表：六个目录项中，只有 qwen3.6-plus 已有对应的 RUNNING foundation-models 部署；另一个部署属于 orchestration。没有创建部署或新增推理请求。本地和示例显示名已明确为 Qwen 3.6 Plus，provider/model ID 保持不变；多模型配置与目录边界见 configuration.md，脱敏查询记录为 .local/cn40-model-catalog-report.json。本轮类型检查、示例与本地 JSON 配置 schema 检查、git diff --check 通过；未重新打包覆盖已发布 rc.1 归档。

## 可选平台记录与范围收尾

早期平台轮次使用 11/12 请求、两个工具执行，已知 total=14339 / output=226，一次取消 usage 未知；对应 7 个会话和资源已清理。后续隔离候选使用 3/6 请求，批准链路中父/子均 completed，父 usage=2834 与两个 SAP attempts 之和一致，审批卡正确显示 Approved；拒绝尚未提交，不记为通过。按用户范围纠正停止平台工作，明确取消仍等待的父任务，删除四个测试会话后 backend sessions/tasks/approvals 均为零，工作目录为空；sap-cn40-r3-* 资源、专属 Secret/PVC 和两个端口转发均已清理。原 kagent-ui 的 UID/spec 未改变，原生 Web 18084 保持运行。证据见 .local/kagent-platform-v3/scope-cleanup-*.json 和 [平台记录](kagent-platform-findings.md)。

保留已验证的可选镜像夹具修复：显式安装 credentials-local、支持 1–12 请求预算，并将宿主 lockfile 摘要加入镜像标签。未修改相邻项目源码，不继续新增父/子 Agent 验收。

真实凭证沿用用户指定的 cn40 指南和 service key，未复制进项目。Token 只在进程内存；本机报告只保存脱敏事实，.local 不进入 Git/tgz。当前实测范围仅为指定 cn40 Qwen route；其他地区/模型、图片、structured output、生产集群和 Secret 轮换不在已验证声明中。
