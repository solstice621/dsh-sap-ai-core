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

npm run test:pack 生成版本化 tgz 和 artifacts/manifest.json（SHA-256、npm integrity、文件清单和干净 profile 结果）。本插件已使用 MIT 许可公开发布，许可文本见仓库和归档内的 LICENSE。GitHub Release 提供版本化 tgz、release-manifest.json 和 SHA256SUMS；未发布 npm。源码中的 dist 同步提交，支持禁用安装脚本的 GitHub 安装。

升级前保存当前包版本和归档校验值，并备份目标 profile 的 package.json、pnpm-lock.yaml、cordis.patch.yml。备份应限制访问权限；SAP 配置只保存凭证引用，Token 保留在进程内。先核对下载归档与该 Release 的 SHA256SUMS，再安装。

桌面版先正常退出应用，再使用应用提供的 dsh 命令；其他 profile 将 desktop 换成实际名称：

~~~sh
dsh plugin --profile desktop add /absolute/path/NEW-PACKAGE.tgz --ignore-scripts
~~~

重新打开 DSH 后先运行 config，再运行 auth/deployment 诊断；付费验证显式开启并限定预算。检查 instance、provider 和 logical model ID 与升级前一致，再继续原会话。修改 wire model、Deployment 或其他路由参数时重新验证该 route 的能力声明。

如果新版本有问题，正常退出桌面应用后安装已保存并核验过的上一版本：

~~~sh
dsh plugin --profile desktop add /absolute/path/PREVIOUS-PACKAGE.tgz --ignore-scripts
~~~

恢复该版本对应的 SAP 配置条目和凭证引用，再重新打开并执行 config/auth 检查。期间如有其他插件或配置更新，应逐项恢复 SAP 条目，保留其他变更。进程重启会重新获取 Token；回滚材料不需要明文 Token。回滚插件包不迁移或重写 DSH 会话存储。

0.1.0-rc.1 是首个公开版本。首次安装的撤回可以在 DSH 插件管理器卸载，或退出桌面应用后运行下列命令，并移除 profile 中属于 sap-ai-core 的配置覆盖：

~~~sh
dsh plugin --profile desktop remove dsh-sap-ai-core
~~~

历史会话继续引用原 provider/model ID；重装时保留这些 ID。确需重命名时，为原 ID 保留兼容配置，或在新会话中选择新 ID；不要批量修改历史 JSONL。凭证引用可以保留供重装使用；彻底撤回时，通过 DSH 凭证服务单独删除本插件持有且不再被其他配置引用的项。

当前独立发行是 0.1.0-rc.1 预发布候选；其已发布 tag、归档及校验值不随后续文档更新而覆盖。S5 自然到期长测在认证网络失败后已退出，直连短测成功但不替代自然到期验证。S6 为独立打包与交付；kagent 父 Agent 的审批、页面恢复和平台生命周期属于可选集成，不作为本插件完成条件。社区投稿尚待审核，完整状态以 progress.md 和 acceptance.md 为准。
