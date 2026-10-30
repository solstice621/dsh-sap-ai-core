# 实施记录

更新：2026-10-31。S0–S4 的实现与独立验证已完成；S5 仍等待真实 Token 自然到期；S6 已完成本机 BYO HTTP、直接平台 UI 和父 Agent 批准验证，父 Agent 的三项平台问题待关闭。独立插件已安装到本机 DSH Desktop，已推送公开 MIT 仓库并发布 v0.1.0-rc.1；GitHub CI 和从 GitHub 禁用脚本的安装验证通过，社区 PR #10730 等待仓库满一天及维护者审核。完整测试映射与交付链接见 [验收记录](acceptance.md)，真实能力边界见 [兼容矩阵](compatibility.md)。

| 阶段 | 状态与交付 | 验证与未关闭事项 |
| --- | --- | --- |
| S0 | 完成：固定 Node 24.19.0、npm 11.17.0、DSH 0.2.1-rc.5 和 lockfile；选定独立 Adapter 与 undici/eventsource-parser 单一传输 | 六项复用比较见 ADR 001；实际 cn40 OAuth/SSE/tools 请求形状、公司代理与本地 TLS 契约已验证 |
| S1 | 完成：严格三层配置、不可变快照、Cordis provider/directory 注册、更新与卸载；版本化 tgz | 真实 Loader 与仓库外干净 profile 通过安装、注册、选择、热更新、卸载重装；只使用已发布包的公开入口 |
| S2 | 完成：Token 缓存、单飞、waiter 取消、凭证代次、迟到 401 及 DSH 失败步骤有界恢复 | 本地 OAuth mock 和两种 DSH waterfall 顺序通过；自然到期的真实验收单列在 S5，不以 mock 替代 |
| S3 | 完成：消息、工具 JSON、SSE、usage、replay、错误和请求级取消 | 多字节拆包、交错工具、尾部 usage、失败 usage、缺失 DONE、buffered 拒绝、路由隔离和真实 DSH 工具闭环通过 |
| S4 | 完成：唯一发现与分页、能力校验、分级诊断、示例和运维文档 | config/auth/deployment 无推理；付费诊断显式预算；本地 kind 的 Secret 引用、环境代理、non-root/只读根目录及真实 stream 通过；生产集群与 Secret 轮换未验证 |
| S5 | 进行中：S-L01、02、03、04、05、06、08 已通过最终真实回归 | 11 次模型请求，中文多轮、15 个流式增量、多工具回传、取消后恢复及双会话单飞通过；S-L07 保留原进程等待自然到期 |
| S6 | 进行中：两个 tgz 的本机 BYO HTTP 联调、直接 UI 批准/拒绝、刷新、usage、取消和父 Agent 批准通过 | 平台 11 次请求；父 Agent 拒绝转发、累计 usage 与审批卡状态待关闭，见 kagent-platform-findings.md。临时资源已清理 |

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

## 正在等待与后续验收

S-L07 于 00:44 启动，PID 77644 已完成首次工具闭环：2/4 请求、工具执行一次。同一进程保留 DSH Agent 和内存 Token，依据权威 expires_in 加 60 秒，预计 2026-10-31 12:45:03（Asia/Shanghai）恢复。每分钟更新 .local/cn40-expiry-report.json。测试将核对 Token generation 更新、acquisitions=2、旧工具结果仍可用且工具未重放。当前状态为 waiting-for-natural-expiry，不能标记 S5 完成，也不要重启这个长测。

相邻 dsh-kagent 当前已有实现、已验证 tgz 和本地运行环境。本项目仅消费其公开 runtime 导出，未修改邻项目或导入其内部源码。平台通过独立 sap-cn40-check Agent 使用 11/12 请求、两个工具执行完成已列场景；已知 total=14339 / output=226，一次取消 usage 未知。首轮直接 UI 的 usage 重复与刷新历史缺失已复验关闭；父 Agent 的三项问题详见 kagent-platform-findings.md。7 个验收会话、后端状态、临时 Kubernetes 资源和端口转发全部清理；独立 S5 不等待该联合项。

真实凭证沿用用户指定的 cn40 指南和 service key，未复制进项目。Token 只在进程内存；本机报告只保存脱敏事实，.local 不进入 Git/tgz。当前实测范围仅为指定 cn40 Qwen route；其他地区/模型、图片、structured output、生产集群和 Secret 轮换不在已验证声明中。
