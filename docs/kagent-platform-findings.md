# S6 平台联合验收发现

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

## 尚未关闭的父 Agent 问题

| 问题 | 证据及归属 |
| --- | --- |
| 拒绝没有传到子 Agent | 父任务 completed，但子任务仍 input-required、审批 pending、工具未执行。Go ADK 2.1.0 的 functiontool.Run 在 handler 前短路拒绝；需要平台转发已经关联的拒绝决定 |
| 父 UI 只显示最后一次 usage | 子任务权威总量为 2819（1354+1465），父 UI 仅显示 1465；平台应优先读取 dsh_kagent_total_usage，再回退单次 kagent_usage_metadata |
| 父审批摘要停留在 Running tools 0/1 | 子 Activity 的工具结果、succeeded、Approved 正确，父主消息中的转发审批卡仍被视作正在执行的本地工具 |

这些问题不在 SAP 模型插件的凭证、路由或推理传输层。独立插件可交付；S-L09 / S6 仍不能标记完成。拒绝遗留的子任务在保存证据后通过 tasks/cancel 明确清理，此清理不算拒绝闭环通过。

## 输入及清理

- SAP tgz SHA-256：087d9de75808e2324ffb8828175d4662d0041277a62f92d5b9ea828d3f38b09b。
- kagent tgz SHA-256：2485f85c05b18702c02373a7b46cd9b723f298a72b8fd41a8bbfa1a3c39abbda。
- 联合镜像：dsh-sap-ai-core-kagent:acceptance-087d9de7-2485f85c-e19f95fa；镜像 ID：sha256:3ebeb2481169b455591f5e879b6314ccb40c8b1701a645ad80b47926291f819f。

本机证据在 .local/kagent-platform-v2 的 observations、final-live-state、orphan-cancellation 和各 cleanup 报告中；这些文件不进入 Git 或发布包。平台输入镜像清单另记录在本机 manifest 中。后续发布归档的文档、bundle 和许可变更会改变 tgz SHA，不覆盖上述历史输入。

已删除 7 个验收会话，SAP backend 的 sessions/tasks/approvals 均为零，工作目录内容已清空，所有 sap-cn40-* Kubernetes 验收资源和专属端口转发已清理。保留共享 kagent namespace、dsh-coding、dsh-parent 和控制面，保留独立自然到期长测的原进程。
