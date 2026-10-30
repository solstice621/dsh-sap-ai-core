# ADR 001：固定接口与单一传输实现

状态：接受，2026-10-31。真实协议证据来自用户指定的桌面 cn40 接入指南所指向的既有测试实例；未创建或修改模型 Deployment。

固定版本为 Node 24.19.0、npm 11.17.0、DSH 0.2.1-rc.5、Cordis 4.0.5、undici 8.12.3、eventsource-parser 3.0.6。完整依赖及 integrity 在 package-lock.json。OpenAI 7.45.1 只作为开发期比较对象，不是发布运行时依赖。

PiAiAdapter 六项评估（实际 npm 包的公开 declarations 和发布 JavaScript）：

| 条件 | 证据 / 结论 |
| --- | --- |
| 动态 Token | resolveApiKey 可以异步取值；满足基本动态认证要求 |
| 每模型独立 Deployment/query | 公开 profile 的 baseURL 是 provider 层，缺少请求级完整 SAP 路由 hook；不满足本项目三层模型映射 |
| 可靠 HTTP 分类 | 发布包 classifyPiAiError 用正则匹配错误消息中的 401/403/429；不满足结构化状态要求 |
| 取消、增量、usage/replay | 有取消和 replay 转换；其 arguments 为解析对象，不能证明保留原始 JSON 文本 |
| 公开入口、无全局修改 | PiAiAdapter 为公开导出；若补齐上述缺口需要超出已公开 hooks |
| 单一重试层 | 当前公开 options 无法证明 SAP 所需的整个错误和重试边界；不采纳委托方案 |

OpenAI SDK 7.45.1 能传自定义 fetch、baseURL、query、headers，并允许 maxRetries=0；但 Stream.fromSSEResponse 在没有 [DONE] 的干净 EOF 处正常结束，无法证明响应完整。tests/contract/protocol.test.ts 将完全相同的坏流交给 SDK 和最终传输：SDK 接受，插件明确失败。SDK 还吞掉一类 transport abort，因此不能仅依靠循环结束判定完整成功。

选择独立 SapAiCoreAdapter，HTTP 用 undici 的请求级 dispatcher，SSE 分帧用 eventsource-parser。插件只实现 SAP 路由、认证和 DSH 协议转换；没有第二套并行传输，没有全局 fetch/dispatcher 修改。所有 HTTP 操作都是单次请求，禁止重定向，不内置模型重试。

DSH 公开接口验证：registerAdapter/replace、registerConfigurableProviders、prepareCall、credentialRef/resolve/describe、attributionHeaders、StreamChunk、agent/request-error。DSH 将 adapter 抛出的 LlmError 复制为标准 failure；因此认证恢复用每次实际请求发送的 X-Request-ID 对应进程内 HTTP 401 收据，不依赖 Error 对象 identity 或错误消息匹配。上游 request ID 另存为脱敏诊断字段。

恢复决定使用公开 appendPluginRecord 记录 plugin:dsh-sap-ai-core/auth-recovery，并用 sessionProjections 保存每个逻辑失败步骤的单次恢复标记。普通重试 policy 固定为 normal，排除 AUTH；测试覆盖 llm-retry 在 SAP 插件之前及之后注册的两种顺序。

真实 cn40 协议取证：OAuth body client_credentials 成功，expires_in=43199；只读部署列表找到一个 RUNNING 的目标。基础流为 text/event-stream，使用 Chat Completions 的 delta.content、delta.reasoning_content、delta.tool_calls、finish_reason、尾部 usage 和 [DONE]。工具调用后不携带 reasoning replay 也能继续回答。

默认 thinking 的探针中 max_tokens=192 未约束含 reasoning 的总 completion_tokens；enable_thinking=false 与 max_tokens=16 的对照请求得到 completion_tokens=16、finish_reason=length、无 reasoning。cn40 示例采用已验证的非 thinking 配置，不宣称验证了 reasoning effort 或所有 Qwen 变体。

网络证据：本机公司代理连接成功；本地 HTTP/HTTPS 代理、按端口 NO_PROXY、企业 CA 注入与不可信证书拒绝均有实际网络测试。生产网络不修改系统代理、VPN 或 DNS。

上游来源：

- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/cookbook/adding-an-llm-adapter.md
- npm 中上述精确版本的公开入口及发布文件；未导入 DSH 内部源码。
- OpenAI 官方文档页面本次请求返回 HTTP 403；SDK 结论来自实际发布包和可重复的对照测试，不依赖搜索摘要。
