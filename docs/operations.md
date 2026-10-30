# 诊断与维护

## 诊断分级

| level | 行为 | 费用与成功含义 |
| --- | --- | --- |
| config | schema、模型映射、CredentialRef describe | 无网络推理；不证明网络可达 |
| auth | client_credentials 获取或复用 Token | 无推理；返回 generation、expiresAt、来源 |
| deployment | 只读检查 RUNNING 状态或唯一发现 | 无推理；显式部署可能没有管理权限 |
| chat | 一条固定合成中文 prompt | 付费；验证有最终文本 |
| stream | 固定合成 prompt，统计上游增量 | 付费；要求多个 text delta、完整终止 |
| tools | DSH Agent 调用受控算术工具、回传、继续回答 | 付费；只允许诊断局部工具 |

API 为 ctx.sapAiCore.diagnose({level, provider, model, signal, ...})。CLI 参数见 --help，开发入口为 npm run diagnose -- --help。chat/stream/tools 必须设置 allowInference=true 或 --allow-inference。预算限制为最多 4 个模型请求、每次请求至多 256 output tokens、120 秒；tools 默认最多 3 请求。Token 获取与 Deployment GET 不计入付费请求数。

诊断报告只记录模型别名、配置代次、凭证来源、Token 有效期、部署标识摘要、增量数、耗时和 usage。正文、工具参数、service key 和 Token 不写报告。成功的低等级检查不能替代更高等级验收。buffered 响应不通过 stream 等级。

工具诊断创建独立 DSH Agent 并隐藏全局工具，只注册一个无副作用算术工具；工具执行与结果回传都由 DSH 完成。失败、中止和预算耗尽都会释放 Agent。普通业务工具仍由 DSH 及其调用者负责权限与审批，模型插件不执行工具。

## Token 与轮换

Token 只保留在进程内，缓存键包含实例、授权/API 端点、Resource Group、OAuth 参数、网络策略、凭证引用和凭证值的进程内 HMAC。每次操作重新解析引用，轮换后使用新键。晚到 401 只比较并失效实际失败的 generation，不清除另一个请求的新 Token。

expires_in 必须是合法的正数；以 OAuth 请求起始时刻保守计算到期。默认提前约 27–30 秒刷新，窗口不超过寿命的一半。刷新失败明确失败，不继续发送过期 Token，也不把新 generation 替换成旧结果。共享刷新只有最后一个等待者放弃时才取消；缓存至多保留 128 个键。

Kubernetes 环境凭证是进程启动快照；变更 Secret 后滚动重启，或使用经过验证的 DSH credential store 热更新。卸载会中止活跃请求、终止刷新并清空 Token。

## 重试与错误

一个 adapter stream 对应一次模型 attempt。undici 传输无模型重试；OAuth 本身也不重试。通用重试要由 DSH llm-retry 插件启用。provider.retryPolicy 默认 normal、最多 3 次重试，初始 1 秒、上限 30 秒、20% 抖动；只包含 RATE_LIMIT/SERVER/TRANSPORT/TIMEOUT。

HTTP 401 由可选 Agent 集成在失败模型步骤最多恢复一次，并记录 plugin:dsh-sap-ai-core/auth-recovery。它只消费本插件实际观察到的推理 HTTP 401 收据，403、OAuth 失败、流中错误不进入这个恢复。直接 ctx.llm.stream 或 adapter.stream 的调用者收到 AUTH 后自行发起下一次显式调用。插件不会重放已经输出的底层流，也不会重复执行工具。

DSH llm-retry 尊重不超过 maxDelayMs 的 Retry-After；normal 模式收到超过上限的等待值会停止恢复。流中断后的 DSH 重试是新的计费 attempt，次数和退避记录在会话中；取消会结束退避。

| code/阶段 | 排查方向 |
| --- | --- |
| INVALID_CONFIG / NO_MODEL / DUPLICATE_ADAPTER | 修正三层映射、能力、URL 或 provider 冲突 |
| MISSING_CREDENTIAL / INVALID_CREDENTIAL | 检查引用来源和明确指定的凭证存储 |
| AUTH / auth | OAuth client、认证形式或有效期响应 |
| AUTH + 401 / inference | 被拒绝的 Token，最多一次 Agent 认证恢复 |
| AUTH + 403 | Resource Group/Deployment 权限，不做刷新循环 |
| DEPLOYMENT_NOT_READY / AMBIGUOUS_DEPLOYMENT / ROUTING | 状态、selector、分页完整性及允许 origin |
| RATE_LIMIT / QUOTA / SERVER | 分别为 429、402、5xx；按 DSH 策略处理 |
| TRANSPORT / TIMEOUT | DNS、TLS、代理、连接或 deadline/idle timeout |
| PROTOCOL / PROVIDER_ERROR | 不完整 SSE、非法字段、缺失 DONE 或 in-band error |
| UNSUPPORTED_OPTION | 该 exact route 未声明的参数或输入类型 |
| ABORTED | 用户取消、消费方退出或插件卸载 |

非 2xx 响应正文不进入错误字符串，HTTP status 与安全 requestId 保留。没有权威 quota 信息时不从正文猜测。重定向返回 REDIRECT_REJECTED，不携带凭证继续请求。

## 可观测性与 usage

可监听 sap-ai-core/attempt 事件；同一内容也在插件 debug 日志中。字段含 provider/model、configGeneration、attemptId、部署摘要、tokenGeneration、firstDeltaMs、elapsedMs、outcome、code/phase/status、受限上游 requestId 和 usage。默认没有业务内容。消费者停在 yield 时，卸载仍会关闭连接；只有消费者最终退出后该 generator 的终态诊断才能结算。

prompt_tokens 包含缓存时会减去 cached_tokens，cacheRead 单独记；completion_tokens 已包含 reasoning，不再次相加。totalTokens 只保留权威值或严格可推导的输入+输出。尾部 usage 在 finish 之前发送，同一 attempt 至多一次。流失败前已取得的 usage 保留；取消前上游未提供 usage 时明确未知。

## 升级、回滚与发布准备

npm run test:pack 生成版本化 tgz 和 artifacts/manifest.json（SHA-256、npm integrity、文件清单和干净 profile 结果）。包保持 private=true、UNLICENSED；生成 tgz 不代表已发布 npm，也不代表具备对外发布许可。

升级前保存当前包版本、配置和凭证引用。安装新包后先 config，再 auth/deployment；付费验证显式开启并限定预算。检查 provider/model ID 保持不变，再切换现有会话。回滚安装旧 tgz 并恢复旧配置；Token 缓存可丢弃后重新获取，不能导出明文 Token 作为回滚材料。

最终发布门槛还包含真实 Token 到期和 dsh-kagent S-L09 联调。后者依赖邻项目的可运行实现；独立 DSH 包及 S5 验收不等待 kagent。当前状态以 progress.md 和 acceptance.md 为准。
