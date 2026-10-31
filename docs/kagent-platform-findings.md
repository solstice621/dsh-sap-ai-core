# 可选平台联合验收记录

范围更新（2026-10-31）：父 Agent 的审批/拒绝、页面恢复与平台任务清理属于 kagent，按用户要求停止扩大这部分工作。本页保留历史问题、隔离候选的已获证据和清理事实；不作为 SAP AI Core 插件 S5/S6 或完成判定的门槛。

2026-10-31 01:19–02:11（Asia/Shanghai），通过本机 Chrome 操作本地 kagent 0.10.4-dsh.1 UI。独立 sap-cn40-check Agent 只安装已验证的 SAP 和 kagent tgz；累计使用 11/12 次请求预算，每次 max_tokens=128、enable_thinking=false。两个真实工具执行完成，已知 total=14339 / output=226，一次取消的 usage 未知。

## 已验证

| 场景 | 结果 |
| --- | --- |
| 直接 UI 批准 | 审批前不执行工具，批准后执行一次并回传真实 Qwen |
| 直接 UI 拒绝 | 工具未执行，模型返回拒绝结果，任务正常结束 |
| 刷新恢复 | 更新后的平台在审批等待和任务完成时都能恢复历史 |
| 直接 UI usage | 修正后的两次 attempt 为 1363 和 1392，页面累计 2755，与 SAP/DSH 一致 |
| UI 流式取消 | 首段已显示 4 个字符，firstDeltaMs=1672，elapsedMs=1702；SAP 记录 ABORTED / inference |
| 父 Agent 委托及批准 | 真实 Go ADK 父 Agent 调用 SAP 子 Agent；刷新、批准、工具执行和结果回传成功 |

首轮的直接 UI usage 重复和刷新历史缺失，已在更新的平台版本上复验关闭。父 Agent 使用确定性委托模型夹具，SAP 子 Agent 使用真实 cn40；不能将此声明扩展为任意父模型都已验证。

## 初次验收发现的父 Agent 问题

| 问题 | 证据及归属 |
| --- | --- |
| 拒绝没有传到子 Agent | 父任务 completed，但子任务仍 input-required、审批 pending、工具未执行。Go ADK 2.1.0 的 functiontool.Run 在 handler 前短路拒绝；需要平台转发已经关联的拒绝决定 |
| 父 UI 只显示最后一次 usage | 子任务权威总量为 2819（1354+1465），父 UI 仅显示 1465；平台应优先读取 dsh_kagent_total_usage，再回退单次 kagent_usage_metadata |
| 父审批摘要停留在 Running tools 0/1 | 子 Activity 的工具结果、succeeded、Approved 正确，父主消息中的转发审批卡仍被视作正在执行的本地工具 |

这些问题不在 SAP 模型插件的凭证、路由或推理传输层。S-L09 保留为可选平台项；本插件的完成条件不包含这些平台修复。拒绝遗留的子任务在保存证据后通过 tasks/cancel 明确清理，此清理不算拒绝闭环通过。后续候选对其中部分问题的验证见下文。

## 隔离修复候选

2026-10-31 在本机隔离副本准备了三个问题的修复候选，未修改相邻项目源码。先完成下列候选测试，随后使用专属测试资源验证批准链路：

- Go 候选将已关联的拒绝送回原 resume 路径，并优先使用权威累计 usage。基线能复现拒绝未转发及累计值错误；候选 tools package 有 48 个 pass 记录（含子测试），无失败。
- UI 候选让转发的子 Agent 审批卡独立显示批准/拒绝状态，执行结果仍属于子会话。基线在批准、拒绝、批量决定、乐观更新、混合本地工具及刷新重建的 6 个场景错误显示 Running tools；修复后 8 项新回归及既有相关测试共 52 项通过。未将获批等同于工具执行成功。

补丁和输入哈希保存在本机 .local/kagent-parent-review；两个补丁均在独立 Git 根通过真实应用校验，四个目标文件逐字节匹配已测试候选。307 个 UI 原始源码/配置文件仍匹配快照。候选测试本身不替代平台验收；本轮不再继续未完成的拒绝链路。

## 后续批准验证与停止平台工作

03:47–03:50（Asia/Shanghai）的隔离候选中，真实父/子任务均 completed，受控工具只执行一次，文件内容符合预期。两个 SAP attempts 的 usage 为 1359 和 1475；父 function response 和页面累计为 2834（2788 input + 46 output）。父审批卡显示 Approved，没有 Running tools 残留；子 Activity 显示 succeeded。审批等待和完成后的刷新没有增加模型请求。回答证据来自最终 artifact/assistant reply 和文件核对，早期页面全文 substring 标志不单独作为回答证据。

随后第二个子任务在等待期间已 canceled，父任务仍 input-required；拒绝没有提交。停止时累计 3/6 次请求、一次工具执行。12:51 明确取消仍等待的父任务，然后删除两个父会话和两个子会话；backend sessions/tasks/approvals 均为零，工作目录为空。专属 sap-cn40-r3-* Kubernetes 资源、Secret、PVC、Helm release 和 18088/18089 端口转发均已清理。原 kagent-ui 的 UID/spec 未变，原生 Web 18084 保持运行。清理取消不算拒绝验收通过。证据保存在 .local/kagent-platform-v3 的 observations、approved-file 和 scope-cleanup-* 报告中。

## 输入及清理

- SAP tgz SHA-256：087d9de75808e2324ffb8828175d4662d0041277a62f92d5b9ea828d3f38b09b。
- kagent tgz SHA-256：2485f85c05b18702c02373a7b46cd9b723f298a72b8fd41a8bbfa1a3c39abbda。
- 联合镜像：dsh-sap-ai-core-kagent:acceptance-087d9de7-2485f85c-e19f95fa；镜像 ID：sha256:3ebeb2481169b455591f5e879b6314ccb40c8b1701a645ad80b47926291f819f。

本机证据在 .local/kagent-platform-v2 的 observations、final-live-state、orphan-cancellation 和各 cleanup 报告中；这些文件不进入 Git 或发布包。平台输入镜像清单另记录在本机 manifest 中。后续发布归档的文档、bundle 和许可变更会改变 tgz SHA，不覆盖上述历史输入。

该早期轮次已删除 7 个验收会话，SAP backend 的 sessions/tasks/approvals 均为零，工作目录内容已清空，对应 Kubernetes 验收资源和专属端口转发已清理。保留共享 kagent namespace、dsh-coding、dsh-parent 和控制面。独立自然到期测试后来于 12:45 失败退出，终态另见 progress.md；不再声称原进程运行中。
