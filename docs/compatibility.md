# 已验证兼容性

更新：2026-10-31。真实验证覆盖 cn40 的一个共享 Orchestration 部署和一个 Qwen 3.6 Plus 的 foundation-models 部署，Resource Group 均为 default。下列矩阵分别记录两种协议的能力，不能互相借用未验证项。

这不是对全部 SAP AI Core region、Deployment 或模型的兼容承诺。配置和 mock 验证了参数化及隔离；新真实环境需要补验收。

## rc.3 思考预算参数验收

2026-10-31 14:53（Asia/Shanghai），同一 cn40 Orchestration 路由对五个模型分别发送 32,000、64,000、128,000 的 thinking_budget，15 次推理均成功完成。高档的五次调用没有显式指定 reasoningEffort，确认 defaultReasoningEffort=high 对应 128,000。

| 模型 | 接口接受的思考预算 | 高档实际思考 Token |
| --- | --- | --- |
| Qwen 3.6 Plus | 32,000 / 64,000 / 128,000 | 142 |
| Qwen 3.6 Flash | 32,000 / 64,000 / 128,000 | 198 |
| Qwen 3.7 Plus | 32,000 / 64,000 / 128,000 | 61 |
| Qwen 3.7 Max | 32,000 / 64,000 / 128,000 | 31 |
| Qwen 3.8 Max | 32,000 / 64,000 / 128,000 | 35 |

验收每次答案上限为 32 Token，并设置 45 秒、4096 字符和已知输出总量保护。15 次已知 usage 合计 1933 total、483 input、1450 output，其中 1385 reasoning；reasoning 已包含在 output 中。该验收证明接口接受这些参数及默认档位生效，不证明模型能够生成满 128,000 思考 Token，不声明厂商最大容量。

首批 8 次的接口均成功；其中 Qwen 3.7 Plus 的 64,000 请求直接回答简单题，reasoningTokens=0，触发了要求非空思考的验收断言，因此原报告仍为 failed。续验允许简单任务直接回答，完成剩余 7 个组合；没有重跑前 8 次来替换记录。汇总为 .local/cn40-thinking-128k-acceptance.json，原始记录为 .local/cn40-thinking-128k-report.json 和 .local/cn40-thinking-128k-continuation-report.json。源代码/依赖输入摘要为 ebf7062b0216442a7fc036062a8d378476a136ed65cc8a517051bd485c57fda7。

## Orchestration v2 五模型（rc.2）

2026-10-31 13:34（Asia/Shanghai），同一既有部署（摘要 405623ec09b5）通过 /v2/completion 调用下列五个模型，model version=latest、enable_thinking=false。五路同时开始仅获取一次 OAuth Token，四个请求共享等待。

| 模型 | 真实正文增量 | DSH 工具闭环 |
| --- | --- | --- |
| Qwen 3.6 Plus | 15 | 通过，一次工具执行和结果回传 |
| Qwen 3.6 Flash | 18 | 通过，一次工具执行和结果回传 |
| Qwen 3.7 Plus | 16 | 通过，一次工具执行和结果回传 |
| Qwen 3.7 Max | 14 | 通过，一次工具执行和结果回传 |
| Qwen 3.8 Max | 22 | 通过，一次工具执行和结果回传 |

工具返回不出现在 prompt 中的随机校验码，模型再次推理后复述该值，证明使用了实际工具结果。Plus → Flash 的中文两轮上下文续接、Flash 第二个正文增量处取消及随后恢复也通过。整轮 19/24 次请求，18 成功、1 主动取消、无失败 attempt；已返回的权威 usage 合计 3847 tokens（3438 input、409 output），取消请求费用未知。

五模型声明文本、streaming、tools 和下文单独验证的思考内容；同一响应并行工具、大参数、图片、structured output、stop、temperature 及自然到期均未在该协议完成真实验收。原直连模型的 parallelToolCalls 证据不能直接沿用。日常配置的 4096 max_tokens 上限用于答案部分；思考预算另计，不声明模型厂商的最大容量。

最终源代码/依赖输入 SHA-256 为 5e11f8506b6bfc6d158b11d482bc70552544c602029475fe11010da48b79c910，脱敏报告为 .local/cn40-orchestration-live-report.json。修复前工具结果回传因 null content 被 SAP 拒绝；去掉该字段后协议通过。Flash 曾跳过可心算的算术工具，最终使用不可预知的工具结果验收；这不保证模型对任意提示词必定选择工具。

### 思考预算与内容

2026-10-31 14:02–14:03（Asia/Shanghai）新增实测，源代码/依赖输入摘要为 7c5d555f40cb15da98c67ac85fa50048877bfea540f29517b343f8b282401df6。五模型的关闭、低（1024）、中（4096）、高（16384）选项均有成功记录；返回的思考块单独显示，usage 的 reasoningTokens 不重复累计。额外的 64-token 探针中，四个模型实际思考 64 tokens，3.8 Max 提前结束于 54 tokens，验证预算可生效。

主思考测试实际 30/35 请求：29 成功，Flash 高档的一次长思考触及 4096 字符保护后主动停止，缺少最终 usage，整轮如实保留为 failed。14:03 对 Flash 高档单独补验，收到 69 个思考增量并完成答案，reasoningTokens=221、totalTokens=250。不能将高档理解成固定输出长度，也不能用保护退出宣称完整回答成功。

五个模型在 64-token 思考预算下均完成真实 DSH 工具闭环。主轮已知 totalTokens=7024、outputTokens=3196、reasoningTokens=2899；Flash 补验另计 250/227/221。被保护停止的请求费用未知。报告为 .local/cn40-thinking-live-report.json 和 .local/cn40-thinking-qwen3.6-flash-budget-16384.json；原先把总输出上限设得低于思考预算的失败记录保留在 .local/cn40-thinking-conflicting-limits-report.json。

## 原 Chat Completions 路由（rc.1 起）

wire model=qwen3.6-plus，api-version=2023-12-01-preview，部署摘要 256f16b758ed。以下历史实测只对应该路由。

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
