# 验收记录

日期：2026-10-31。完整目标仍按 PLAN.md；此记录区分确定性测试、真实验证和外部待办。

## 确定性矩阵

| ID | 证据位置 | 验证内容 |
| --- | --- | --- |
| S-T01 | integration/dsh、integration/loader；test:pack | provider 选择/卸载、真实 Loader、独立 tgz 安装 |
| S-T02 | unit/auth | 缺失、空值和非法凭证在网络前失败 |
| S-T03 | unit/auth | body/basic 及 RFC form 编码 |
| S-T04 | unit/auth | 24 个到期请求只刷新一次 |
| S-T05 | unit/auth | 单 waiter 取消、所有 waiter 放弃、连接释放 |
| S-T06 | unit/auth | 凭证轮换、迟到 401、实例隔离 |
| S-T07 | unit/auth、integration/dsh | 非法 expires_in、连续 401 有界、403 终止、两种 waterfall 顺序 |
| S-T08 | unit/routing | URL/path/query/header 与保留字段校验 |
| S-T09 | unit/routing | 零/一/多候选、所有分页、404 只影响下次 attempt |
| S-T10 | unit/routing | 配置快照、实例/RG/model/token 并发隔离 |
| S-T11 | contract/protocol | UTF-8 拆包、粘包、keepalive、block 顺序 |
| S-T12 | contract/protocol、integration/dsh | 交错工具 index、晚到 ID、大原始 JSON、实际 DSH 执行 |
| S-T13 | contract/protocol | usage-only、尾部/缺失 usage、失败 attempt 保留一次 |
| S-T14 | contract/protocol、unit/routing | 缺失 DONE、in-band error、非法流、idle/header 超时 |
| S-T15 | contract/protocol、unit/routing、integration/loader | SSE/discovery 取消、提前退出、停在 yield 时重启清理 |
| S-T16 | unit/routing、integration/dsh | direct 无重试，DSH 的 503/429、Retry-After、次数和退避取消 |
| S-T17 | contract/protocol、integration/dsh | 未声明 stop/reasoning/image/未知选项明确拒绝 |
| S-T18 | contract/network、unit/routing | HTTP/HTTPS 代理、NO_PROXY、CA、OAuth/推理重定向拒绝 |
| S-T19 | contract/protocol | 缓存输入及 reasoning 不重复累计 |
| S-T20 | contract/protocol、integration/dsh | 原始工具历史、同模型 replay、跨模型/部署隔离 |

所有测试使用合成凭证与本地 mock；生产源码没有测试注入的 URL 或凭证。最终运行数量与 packed-package 结果同步记录于 progress.md 和 artifacts/manifest.json。

## 真实 cn40 短验收

2026-10-31 00:29 首次通过；去掉未验证的 in-history system 更新元数据后，00:43（Asia/Shanghai）最终回归再次通过：

~~~sh
SAP_AICORE_LIVE=1 npm run test:live:cn40 -- --connection .local/cn40-connection.json
~~~

每次运行预算 12 次，实际均为 11 次请求；每次 max_tokens=128、enable_thinking=false。S-L01、02、03、04、05、06、08 全部通过。两个会话共享一次 Token 获取；最终流式检查有 15 个正文增量；两个工具在同一响应发出并分别执行一次；第二个正文增量处取消后下一轮成功。

机器证据保存在本机 .local/cn40-live-report.json 和 .local/cn40-live-final-report.json，只含统计、时间、来源和标识摘要，不包含正文、工具参数、Secret 或 Token。文件不会进入 tgz/Git；可公开的能力摘要见 compatibility.md。S0 的四次短探针与实际插件验收分开记录。

## 本机联合与 Pod 验收

00:48 将两个 tgz 安装到仓库外全新目录，经过 kagent BYO HTTP 调用真实 cn40。7 次模型请求完成：批准后才写入受控临时文件、拒绝后不写入、工具 call/result ID 配对、同 context 新 task、A2A 显式取消贯通到 SAP HTTP、随后新任务成功。记录为 .local/kagent-joint-report.json；这关闭本机桥接风险，不冒充实际平台 UI 通过。

00:53 在显式指向 127.0.0.1 的本地 kind 集群创建专用 Namespace。安装后的 SAP tgz 在 non-root、readOnlyRootFilesystem Pod 中通过 Secret 引用和环境代理完成 config/auth/deployment/stream。仅 1 次推理，15 个正文增量；结束后 Namespace 和 Secret 已删除。记录为 .local/kubernetes-live-report.json。镜像仅包含程序、锁定依赖和固定测试入口，不含凭证。kindnet 不执行 NetworkPolicy，此测试不证明网络隔离。

## 尚未关闭

- S-L07：测试进程 PID 77644 已完成首次工具闭环并保留同一个 Agent/Token，预计 2026-10-31 12:45:03（Asia/Shanghai）后继续。状态在 .local/cn40-expiry-report.json，每分钟更新 heartbeat。等待中不标记通过。
- S-L09 / S6 平台验收：本机联合、直接 UI 批准/拒绝、刷新、正确 usage 和取消已通过；父 Agent 委托并批准成功。父 Agent 的拒绝转发、累计 usage 和审批卡状态仍待平台修正。实际使用 11/12 请求、两个工具执行，临时会话、文件、Kubernetes 资源和端口转发均已清理，见 [平台记录](kagent-platform-findings.md)。独立 SAP 插件不导入邻项目内部模块。
- 生产 Kubernetes、Secret 轮换、其他 SAP region/model、真实大 arguments、图片/structured output 等未扩展到已验证矩阵。
- GitHub CI 配置已加入，尚未在远端 CI 执行；本机检查不能记为 GitHub CI 通过。

上述项目保留在原 PLAN 中；独立包构建成功不代表整个 S0–S6 完成。
