# 配置与安装

插件安装为普通 Cordis/DSH provider。开发和独立验收基线为 Node 24.19.0、npm 11.17.0、DSH 0.2.1-rc.5 和 Cordis 4.0.5。声明 Node >=24.19.0 <25；DSH 版本仅声明精确的 0.2.1-rc.5。

## 安装和模型选择

使用 DSH 插件安装界面安装 GitHub 仓库或 Release tgz。命令行方式如下；桌面版先正常退出应用，安装后重新打开：

~~~sh
dsh plugin --profile desktop add github:solstice621/dsh-sap-ai-core#v0.1.0-rc.1
# 或使用预编译归档
dsh plugin --profile desktop add /absolute/path/dsh-sap-ai-core-0.1.0-rc.1.tgz
~~~

其他 CLI profile 使用其实际名称。bundle 自动注册 sap-ai-core 条目，初始 instances/providers 为空，不发网络请求。已有 DSH profile 必须提供 llm 和 credentials 服务。将 [cn40 patch](../examples/cn40-qwen/cordis.patch.yml) 的配置更新合并到 profile 的 cordis.patch.yml，填入已知的 OAuth host 与既有 Deployment ID。不要再次 insert 同一个插件。示例 provider 为 sap-ai-core-demo，逻辑模型为 qwen-demo。它们会进入 DSH provider/model 列表及 configurable-provider directory；界面只使用凭证引用，OAuth client secret 流程在 Node 进程运行。

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

SAP AI Core 提供的模型取决于 region、实例及授权。插件没有把 Qwen 写死为唯一模型：每个 provider 的 models 数组可以登记多个逻辑模型，每项分别配置 upstreamModel 和 deployment。DSH 选择器展示这些已配置项；打开选择器不会自动查询云目录或创建部署。

2026-10-31 对当前 cn40 实例执行只读查询：GET /v2/lm/scenarios/foundation-models/models 返回下列六个目录项；对 default 资源组的完整 Deployment 列表查询发现一个 RUNNING foundation-models 部署，对应 qwen3.6-plus，另一个 RUNNING 部署属于 orchestration。查询没有发起推理。

| 目录模型 | 当前 Chat Completions 接入状态 |
| --- | --- |
| qwen3.6-plus | 已有对应部署，已在 DSH 配置并完成短验收 |
| qwen3.6-flash | 目录可见；该资源组未发现对应 foundation-models 部署 |
| qwen3.7-plus | 目录可见；该资源组未发现对应 foundation-models 部署 |
| qwen3.7-max | 目录可见；该资源组未发现对应 foundation-models 部署 |
| qwen3.8-max | 目录可见；该资源组未发现对应 foundation-models 部署 |
| text-embedding-v4 | Embeddings 模型，不属于本插件首版的聊天接口 |

模型目录存在某项，不代表能把它的名字发送到 Qwen 3.6 Plus 的部署来切换模型。接入其他聊天模型时，先由部署者提供匹配的既有部署，再在 models 添加独立 ID、upstreamModel、deployment 和该路由的能力证据。也可用下文的唯一发现 selector 解析该模型已有部署；这不会自动枚举或注册模型。不能复制 qwen3.6-plus 的 verified 能力声明作为其他模型的实测结果。

Orchestration 可以提供另一种模型访问方式，但请求/响应协议不同，当前插件不把它伪装成 foundation-models 的 Chat Completions 路由。其他地区可能有不同目录，本次 cn40 查询不代表 SAP AI Core 的全球模型清单。DSH 的品牌介绍也不作为能力证据；当前插件向 DSH 声明的输入模态只有 text。

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

默认 inferencePath 为 /v2/inference/deployments/{deploymentId}，统一附加 /chat/completions。Deployment ID 作为单一路径段编码；模板只接受一次 {deploymentId}，不允许 query、fragment、相对跳转或重复 suffix。apiVersion 仅作为 api-version query 编码；不填则不发送。

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

## 能力和参数

capabilities 必须附 evidence.status 和 evidence.reference。streaming、tools、parallelToolCalls、reasoningContent、temperature、stop 默认 false。mode=streaming 要求 streaming=true；buffered 不算流式验收。图片和 structured output 首版不支持。

compatibility 控制 systemRole、developerRole、maxTokensField、includeUsage、reasoningField、replayReasoning 及明确的 vendor parameters。身份、消息、工具、stream 和路由等保留参数不可被 parameters 覆盖。reasoningEfforts 是经过验证的 ID 到参数映射；未知 effort 明确拒绝，不将模型名称当作能力证据。

maxOutputTokens 是本配置允许的单次请求上限，defaultMaxTokens 是缺省请求值；它们不代表厂家上下文容量。cn40 示例主动限制为 128，未声明 contextWindow。enable_thinking=false 已实测；默认 thinking 下 max_tokens 曾未限制总 completion，因此示例和小预算测试都关闭 thinking。

工具 ID、原始 arguments JSON 和 tool result 顺序保留。多个交错增量按 index 组装。动态 system 提示词更新由 DSH 缺省投影处理；插件不声明尚未实测的 in-history 更新语义，并保留实际收到的 system 消息顺序。cn40 无需 reasoning replay 也能回传工具结果；默认关闭 replayReasoning。其他模型仅在必要时启用，原生状态按 provider、逻辑模型和配置路由 identity 限定，切换后不会盲目回传。

## 网络和 Kubernetes

proxyMode=environment 显式使用 undici 的 HTTP_PROXY、HTTPS_PROXY、NO_PROXY；小写变量优先。proxyMode=direct 不使用环境代理；proxyMode=url 只使用 proxyUrl，不允许代理 URL 内嵌凭证。每次调用创建请求级 dispatcher，不修改全局 fetch。

cn40 曾通过公司代理实测；只有 proxy.sha.sap.corp:8080 可达时才使用。2026-10-31 公司代理 DNS 失败后，请求级 direct 的认证和真实流式检查通过，本地 desktop profile 已改用 direct。该配置不自动选择或回退网络路径，其他环境需自行确认可达性。插件不会更改系统代理、VPN 或 DNS。Kubernetes 使用集群出口配置，不直接照搬本机代理。TLS 始终验证证书；network.caFile 可加载明确的企业 CA 文件，并保留 Node 内置根证书。

[Kubernetes 容器片段](../examples/kubernetes/container-fragment.yaml) 引用已有 Secret 和 ConfigMap，不是独立资源。环境 Secret 更新通常需重启 Pod；热轮换应使用 DSH 可更新凭证存储并另行验证。不要将 Secret 烘焙进镜像。示例 liveness 只运行 config 检查，不发 OAuth 或付费请求。本地 kind 的真实 auth/deployment/stream 已在非 root、只读根目录 Pod 通过；生产集群、Secret 轮换和 NetworkPolicy 隔离未验证。
