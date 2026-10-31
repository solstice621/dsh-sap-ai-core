# 已验证兼容性

更新：2026-10-31。当前真实验证范围为一个既有 SAP AI Core cn40 foundation-models Deployment，wire model 为 qwen3.6-plus，Resource Group 为 default，api-version 为 2023-12-01-preview。部署标识仅记录 SHA-256 前 12 位：256f16b758ed。

这不是对全部 SAP AI Core region、Deployment 或模型的兼容承诺。配置和 mock 验证了参数化及隔离；新真实环境需要补验收。

## 实测能力

| 能力 | 状态 | 证据或限制 |
| --- | --- | --- |
| OAuth body client_credentials | 已验证 | 返回 expires_in 约 43199 秒；basic 仅本地契约验证 |
| 显式 Deployment 推理 | 已验证 | 实际插件及只读 RUNNING 检查 |
| 文本、中文多轮 | 已验证 | DSH 会话保留上一轮指定的中文暗号 |
| 真正 SSE streaming | 已验证 | 最终短回归收到 15 个上游 text delta，首增量约 1.3 秒 |
| 单工具及结果回传 | 已验证 | DSH 执行一次受控工具，两次模型请求完成闭环 |
| 同一响应多工具 | 已验证 | 同一模型响应发出两个工具调用，两个结果回传后继续回答 |
| 大 arguments | mock 已验证，真实未验证 | 中文/多字节大 JSON 与交错分片通过契约测试；live 只验证多工具 |
| 运行中取消 | 已验证 | 第二个正文增量后取消，底层 attempt 中止，同一会话下一轮成功 |
| 两个独立会话并发 | 已验证 | 回答不交叉，单次 OAuth 获取，另一个等待者共享刷新 |
| enable_thinking=false | 已验证 | 128-token 短验收；独立 16-token 探针以 length 结束且无 reasoning |
| 默认 thinking / reasoning_content | 仅 S0 探针 | 已观察 reasoning_content，但 max_tokens=192 曾返回 1009 completion tokens；正式示例关闭 |
| reasoning effort 参数 | 未验证，默认拒绝 | 不推断 low/high 等含义 |
| reasoning replay | cn40 不需要；mock 隔离已验证 | 工具回传不带原生 reasoning 也成功 |
| stop、temperature | 真实未验证，示例关闭 | 插件仅在明确能力配置下发送 |
| 图片、structured output | 首版不支持 | 明确拒绝 |
| Token 自然到期的新步骤 | 未通过，测试已退出 | 2026-10-31 12:45 刷新认证发生 TRANSPORT 错误，generation=2 未验证；不以直连短测替代 |
| cn40 discovery 唯一选择 | 列表形状探针 + mock | 完整分页与零/一/多候选为确定性测试；live 推理固定 ID |
| 企业代理/TLS、请求级直连 | 代理历史验证通过；当前直连已验证 | 长测恢复时公司代理 DNS 失败；随后 direct auth/stream 成功，11 增量、usage=55，TLS 校验开启 |
| Kubernetes Secret 引用与只读根目录 | 本地 kind 已验证 | 真实凭证通过临时 Secret 引用，非 root 容器成功；临时 Namespace/Secret 已删除 |
| Kubernetes Secret 轮换 / 生产集群 | 未验证 | 环境注入更新通常需重启，未修改真实 service key |
| dsh-kagent BYO HTTP 联调 | 已验证 | 两个 tgz，7 次真实请求，批准/拒绝、工具 ID、会话续接、A2A 取消贯通 |
| kagent 平台 UI / Agent 间调用（可选） | 部分已验证，停止扩大 | 直接 UI 与父批准通过，隔离候选的父 usage/审批卡通过；父拒绝未提交。非本插件验收门槛 |

S5 短验收使用实际发布的 DSH 包和本插件实现，不使用 mock 代替真实 Qwen。11 次模型请求中 10 次完成、1 次主动取消；已返回权威 usage 的请求共 2131 tokens，其中输出 185。被取消请求没有尾部 usage，其费用未知，不计作零。

最终短回归时间为 2026-10-31 00:43（Asia/Shanghai），代码/依赖输入摘要为 317c9f14a12fff83b0218892f93c6e92551444259ced9891b82ef7ab491323de。00:48 的本机 BYO 联调另用 7 请求，已知 usage 为 8584 tokens/92 output；00:53 的 kind Pod 使用 1 次请求，usage 为 67 tokens/44 output。各批次单独记录，不混作一次 attempt。

## 固定软件组合

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| Node | 24.19.0 | 开发和本机验证 |
| npm | 11.17.0 | lockfile 和干净安装 |
| DSH peers | 0.2.1-rc.5 | LLM、credentials、可选 Agent/Session/Tools |
| Cordis | 4.0.5 | 插件生命周期和注入 |
| Cordis Loader | 1.0.6 | profile、volatile 更新及重启验收 |
| Schemastery | 3.18.5 | 可序列化配置表单 |
| undici | 8.12.3 | 唯一推理 HTTP 传输 |
| eventsource-parser | 3.0.6 | SSE framing |
| zod | 4.4.3 | 严格配置校验 |
| TypeScript / tsx | 6.0.3 / 4.23.15 | 编译与开发测试 |
| OpenAI SDK | 7.45.1 | 仅开发复用对照；不进入生产传输 |

PiAiAdapter 与 OpenAI SDK 的选择依据见 [ADR 001](adr-001-transport.md)。SDK 在缺失 DONE 的干净 EOF 处不报错，不能独立满足本项目的流完整性契约。插件最终只保留 undici + eventsource-parser 这一条主传输路径。
