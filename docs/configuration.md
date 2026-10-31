# 配置与安装

插件安装为普通 Cordis/DSH provider。开发和独立验收基线为 Node 24.19.0、npm 11.17.0、DSH 0.2.1-rc.5 和 Cordis 4.0.5。声明 Node >=24.19.0 <25；DSH 版本仅声明精确的 0.2.1-rc.5。

## 安装和模型选择

使用 DSH 插件安装界面安装 GitHub 仓库或 Release tgz。命令行方式如下；桌面版先正常退出应用，安装后重新打开：

~~~sh
dsh plugin --profile desktop add github:solstice621/dsh-sap-ai-core#v0.1.0-rc.4
# 或使用预编译归档
dsh plugin --profile desktop add /absolute/path/dsh-sap-ai-core-0.1.0-rc.4.tgz
~~~

其他 CLI profile 使用其实际名称。bundle 自动注册 sap-ai-core 条目，初始 instances/providers 为空，不发网络请求。已有 DSH profile 必须提供 llm 和 credentials 服务。推荐将 [cn40 五模型 JSON](../examples/cn40-qwen/multi-models.json) 作为 profile 的 cordis.patch.yml 中现有 sap-ai-core 条目的 config，填入 OAuth host 和凭证引用。示例 provider 为 sap-ai-core-demo，五个模型共用该实例的认证和 Orchestration 部署。不要再次 insert 同一个插件。模型会进入 DSH provider/model 列表及 configurable-provider directory；OAuth client secret 流程在 Node 进程运行。

原 [单模型 Chat Completions patch](../examples/cn40-qwen/cordis.patch.yml) 仍可使用。升级既有配置时保留逻辑 ID；例如 desktop 的 qwen-cn40 继续映射 Qwen 3.6 Plus，只更换明确的 provider 协议和部署选择。

独立命令行诊断无需 kagent。在提供下述 DSH peers 的普通 npm 宿主目录中运行：

~~~sh
./node_modules/.bin/dsh-sap-ai-core-diagnose \
  --config /absolute/path/plugin.json \
  --provider sap-ai-core-demo --model qwen-demo --level config
~~~

完整 DSH profile 已提供所需服务；桌面应用可由自身加载器提供 peers，直接用普通 node 执行 desktop 插件目录里的 CLI 不等于在桌面宿主运行。若在普通 npm 目录使用独立诊断 CLI，需正常安装 package.json 中的必需 peers，并另行安装 @deepseek-ai/dsh-credentials-local@0.2.1-rc.5 和 @deepseek-ai/dsh-launch-environment@0.2.1-rc.5 两个可选 peers；它们负责本地凭证和诊断环境，不被复制到插件。工具诊断额外需要这些精确版本的公开 DSH 包：

~~~sh
npm install @deepseek-ai/dsh-agent@0.2.1-rc.5 \
  @deepseek-ai/dsh-agent-loop@0.2.1-rc.5 \
  @deepseek-ai/dsh-session@0.2.1-rc.5 \
  @deepseek-ai/dsh-session-projection@0.2.1-rc.5 \
  @deepseek-ai/dsh-tools@0.2.1-rc.5 \
  @deepseek-ai/dsh-system-prompt@0.2.1-rc.5
~~~

## 模型目录与可调用模型

SAP AI Core 提供的模型取决于 region、实例及授权。每个 provider 的 models 数组登记逻辑模型，DSH 选择器展示这些配置项。0.1.0-rc.2 的 cn40 预设已经包含用户要求的五个聊天模型；它们共用一个实例、一份凭证和现有共享部署。打开选择器不会发起推理。该版本提供固定预设，尚不自动同步未来新增的云端目录项。

2026-10-31 对当前 cn40 实例执行只读查询：GET /v2/lm/scenarios/foundation-models/models 返回下列六个目录项；对 default 资源组的完整 Deployment 列表查询发现一个 RUNNING foundation-models 部署，对应 qwen3.6-plus，另一个 RUNNING 部署属于 orchestration。查询没有发起推理。

| 目录模型 | rc.2 接入状态 |
| --- | --- |
| qwen3.6-plus | 共享 Orchestration 流式及工具闭环通过；原直连部署仍可用 |
| qwen3.6-flash | 共享 Orchestration 流式及工具闭环通过 |
| qwen3.7-plus | 共享 Orchestration 流式及工具闭环通过 |
| qwen3.7-max | 共享 Orchestration 流式及工具闭环通过 |
| qwen3.8-max | 共享 Orchestration 流式及工具闭环通过 |
| text-embedding-v4 | Embeddings 模型，不属于本插件首版的聊天接口 |

原先只显示一个模型，是配置使用了 Qwen 3.6 Plus 的 foundation-models 直连部署；实测向该部署发送 Flash 的模型名会返回 400。共享 Orchestration 接受请求中的模型名，因此这五个模型无需各建一个部署。五项能力均有各自的真实验证记录。新增其他模型时，仍需核对该实例的 allowedScenarios、协议和实际能力。

Orchestration 通过显式 sap-orchestration-v2 协议接入。每次请求选定一个模型，插件不会在失败后私自改用其他模型或协议。其他地区可能有不同目录，本次 cn40 查询不代表 SAP AI Core 的全球模型清单；当前输入模态为 text。

## 三层映射

| 层 | 必填或主要字段 | 说明 |
| --- | --- | --- |
| instances | apiBaseUrl、tokenUrl、credentials、oauth.clientAuthMethod | 每个实例独立授权和网络策略 |
| providers | instance、resourceGroup、protocol、models | 一个 DSH provider route；apiVersion 可省略 |
| models | id、upstreamModel、deployment、capabilities | 逻辑 ID 稳定，wire model 与部署独立配置 |

[通用模板](../examples/generic/plugin.json) 保守地关闭未知能力，仅适合开始 config/auth/deployment 检查；启用推理前需验证该 route 的协议、max token 字段和模式。[cn40 模板](../examples/cn40-qwen/plugin.json) 使用已实测的 qwen3.6-plus 配置。更换 region、model 或 Deployment 后必须重新验证能力。

每次 prepareCall/stream 捕获不可变配置。Loader volatile 更新从下一次调用生效；已经准备的调用保持旧配置。无效配置或 provider 冲突不会替换当前路由。Loader 可能保留被拒绝的原始配置供修正，重启前需修好文件；不能把内存旧配置仍可用当作文件已经保存成功。

## 凭证

clientIdRef/clientSecretRef 是 DSH CredentialRef 名称，不能直接写 client secret。DSH credentials-local 的存储值优先于 launcher 环境；config 诊断显示 configured/source，不输出值。

独立 CLI 只接受配置声明的 process 环境引用，或显式 --credentials-file。默认使用空的临时凭证存储，不搜索个人 DSH home、.env、桌面或下载目录。

也可一次性显式指定 service key：

~~~sh
./node_modules/.bin/dsh-sap-ai-core-diagnose \
  --config /absolute/path/plugin.json --provider sap-ai-core-demo --model qwen-demo \
  --service-key /absolute/path/service-key.json --instance company-cn40 --level auth
~~~

文件中的 AI_API_URL、url 和 auth_placement 必须与该实例一致。clientid/clientsecret 只注入该宿主的内存 launcher snapshot，不复制到项目、环境变量、配置或日志。不要在命令行传入明文 Secret。

## 路由

默认 inferencePath 为 /v2/inference/deployments/{deploymentId}。openai-chat-completions 附加 /chat/completions；sap-orchestration-v2 附加 /v2/completion。Deployment ID 作为单一路径段编码；模板只接受一次 {deploymentId}，不允许 query、fragment、相对跳转或重复 suffix。apiVersion 仅用于 Chat Completions 的 api-version query；Orchestration 使用版本化路径，配置 apiVersion 会明确报错。

显式 deployment.id 不触发管理 API，所以拥有推理权限而没有 Deployment 列表权限仍可用。deployment 诊断会主动读取管理 API，权限不足只说明管理检查不可用。

只读发现配置示例：

~~~json
{
  "selector": { "scenario": "foundation-models", "model": "qwen3.6-plus" },
  "cacheTtlMs": 30000,
  "pageSize": 100,
  "maxPages": 10
}
~~~

用它完整替换 deployment 对象。只有全部分页中恰好一个匹配的 RUNNING 部署才通过；可增加 selector.version。model 从 SAP backendDetails/backend_details.model 元数据读取，不猜 configurationName。零候选、多候选、重复分页或不完整列表均失败。deploymentUrl 必须属于 apiBaseUrl origin 或显式 allowedDeploymentOrigins；任何 HTTP 重定向均拒绝。404/410 仅使后续 attempt 的发现缓存失效。

Orchestration 的 discovery 使用 {"selector":{"scenario":"orchestration"}}，不包含 selector.model/version；每个逻辑模型的 upstreamModel 和可选 upstreamModelVersion（cn40 为 latest）在请求体中选择模型。多个 RUNNING Orchestration 部署时，用 {"id":"EXISTING_SHARED_DEPLOYMENT"} 替换 deployment。此配置不会创建或修改云端部署。

Orchestration 只包装现有消息和工具转换：历史放入 messages_history，工具调用消息省略 SAP 不接受的 null content；工具参数、ID 和结果原样保留。仅处理 final_result，避免 intermediate_results 重复输出及重复计费；服务端模型 max_retries 固定为 0，由 DSH 控制重试。

## 能力和参数

capabilities 必须附 evidence.status 和 evidence.reference。streaming、tools、parallelToolCalls、reasoningContent、temperature、stop 默认 false。mode=streaming 要求 streaming=true；buffered 不算流式验收。图片和 structured output 首版不支持。

compatibility 控制 systemRole、developerRole、maxTokensField、includeUsage、reasoningField、replayReasoning 及明确的 vendor parameters。身份、消息、工具、stream 和路由等保留参数不可被 parameters 覆盖。reasoningEfforts 是经过验证的 ID 到参数映射；未知 effort 明确拒绝，不将模型名称当作能力证据。

maxOutputTokens 是本配置允许的 maxTokens 上限，defaultMaxTokens 是缺省请求值；它们不代表厂家上下文容量。五模型日常配置使用 4096；单模型验收示例仍限制为 128，live 脚本每次显式设置小预算。均未臆测 contextWindow。Qwen 的 max_tokens 限制答案部分，思考预算另外设置；usage.outputTokens 包含二者，reasoningTokens 是其中明细，不能相加重复计费。

### 思考选项

rc.4 五模型预设通过 DSH 的公开 reasoning 元数据提供五档等距预算及关闭选项，默认 max：

| DSH 选项 | 发送到 SAP 的模型参数 |
| --- | --- |
| 关闭思考（off） | enable_thinking=false |
| 低（low） | enable_thinking=true，thinking_budget=25600 |
| 中（medium） | enable_thinking=true，thinking_budget=51200 |
| 高（high） | enable_thinking=true，thinking_budget=76800 |
| 极高（xhigh） | enable_thinking=true，thinking_budget=102400 |
| Max（max，默认） | enable_thinking=true，thinking_budget=128000 |

这些档位每级增加 25,600 Token，最高为 128,000；不代表厂商保证的最大思维链长度。模型可以提前结束，简单任务也可能不产生思考 Token。日常实例请求超时设置为 30 分钟，以允许更长的思考；流空闲超时仍为 30 秒，取消仍立即传递。模型和服务自身的上限仍然适用。选择一个模型的档位只影响该次调用，不改变其他模型或并发会话的设置。

128,000 在 rc.3 已由五模型短请求验证接受；新增的 25,600、51,200、76,800、102,400 数值仅纳入确定性参数映射检查，尚未分别补做真实请求。已有安装须同步更新 reasoningEfforts 和 defaultReasoningEffort；旧会话显式保存的 high 现在对应 76,800，需要最高预算时改选 max，详见 [升级说明](operations.md#升级回滚与发布准备)。

SAP Orchestration 的 reasoning_content 是 content 块数组，插件转换成独立的 DSH reasoning 增量。文本与正文保持分离；含签名或不透明内容的 reasoning 暂不支持。默认不回传原生 reasoning 历史，五个模型的思考模式工具闭环已经验证。

参数依据：[阿里云深度思考](https://help.aliyun.com/zh/model-studio/deep-thinking)、[Chat Completions 参数](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)。Qwen 3.8 另有原生 reasoning_effort；本预设统一使用已有实测依据的 thinking_budget 参数，xhigh/max 只是 DSH 选项 ID，不发送原生 reasoning_effort。高级配置若选 max_completion_tokens，SAP 要求它大于 thinking_budget；不能用较小的总输出上限测试较大的思考预算。真实证据与 Flash 高档的预算保护记录见 compatibility.md。

工具 ID、原始 arguments JSON 和 tool result 顺序保留。多个交错增量按 index 组装。动态 system 提示词更新由 DSH 缺省投影处理；插件不声明尚未实测的 in-history 更新语义，并保留实际收到的 system 消息顺序。cn40 无需 reasoning replay 也能回传工具结果；默认关闭 replayReasoning。其他模型仅在必要时启用，原生状态按 provider、逻辑模型和配置路由 identity 限定，切换后不会盲目回传。

## 网络和 Kubernetes

proxyMode=environment 显式使用 undici 的 HTTP_PROXY、HTTPS_PROXY、NO_PROXY；小写变量优先。proxyMode=direct 不使用环境代理；proxyMode=url 只使用 proxyUrl，不允许代理 URL 内嵌凭证。每次调用创建请求级 dispatcher，不修改全局 fetch。

cn40 曾通过公司代理实测；只有 proxy.sha.sap.corp:8080 可达时才使用。2026-10-31 公司代理 DNS 失败后，请求级 direct 的认证和真实流式检查通过，本地 desktop profile 已改用 direct。该配置不自动选择或回退网络路径，其他环境需自行确认可达性。插件不会更改系统代理、VPN 或 DNS。Kubernetes 使用集群出口配置，不直接照搬本机代理。TLS 始终验证证书；network.caFile 可加载明确的企业 CA 文件，并保留 Node 内置根证书。

[Kubernetes 容器片段](../examples/kubernetes/container-fragment.yaml) 引用已有 Secret 和 ConfigMap，不是独立资源。环境 Secret 更新通常需重启 Pod；热轮换应使用 DSH 可更新凭证存储并另行验证。不要将 Secret 烘焙进镜像。示例 liveness 只运行 config 检查，不发 OAuth 或付费请求。本地 kind 的真实 auth/deployment/stream 已在非 root、只读根目录 Pod 通过；生产集群、Secret 轮换和 NetworkPolicy 隔离未验证。
