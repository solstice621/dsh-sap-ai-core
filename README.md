# dsh-sap-ai-core

SAP AI Core 的独立 DSH 模型插件。共用一份 OAuth 认证，在 DSH 中直接选择模型；插件处理 Token、部署路由、流式响应和工具协议，DSH 负责 Agent 循环与工具执行。

0.1.0-rc.2 提供 cn40 的五个模型：**Qwen 3.6 Plus、3.6 Flash、3.7 Plus、3.7 Max、3.8 Max**。五个模型共用现有 Orchestration 部署，均已通过真实流式输出和 DSH 工具闭环；切换模型保留上下文、并发认证复用及取消后恢复也已验证。原有 OpenAI 兼容 Chat Completions 路由继续支持。

五个模型均提供 **关闭思考／低／中／高** 选项，默认关闭。三档分别设置 1024／4096／16384 思考 Token 预算，思考与正文分别显示；这些数值是上限，模型可以提前结束。

模型列表来自配置中的五模型预设，可按其他实例的能力扩展。Token 自然到期长测尚未通过，社区投稿待审核；详细边界见 [验收记录](docs/acceptance.md)、[实施进度](docs/progress.md) 和 [模型目录说明](docs/configuration.md#模型目录与可调用模型)。

## 使用

兼容 DSH 0.2.1-rc.5、Cordis 4.0.5、Node 24（24.19.0 起）。开发基线固定 Node 24.19.0 / npm 11.17.0。

在 DSH 的插件安装界面输入 GitHub 地址：

~~~text
https://github.com/solstice621/dsh-sap-ai-core
~~~

也可以使用 DSH 命令。桌面版先正常退出应用，再对 desktop profile 安装，完成后重新打开：

~~~sh
dsh plugin --profile desktop add github:solstice621/dsh-sap-ai-core#v0.1.0-rc.2
~~~

其他 CLI profile 将 desktop 换成实际名称。仓库提交了 dist 和 dsh.bundle，无需允许安装期构建脚本。预编译 tgz 也可从 [GitHub Releases](https://github.com/solstice621/dsh-sap-ai-core/releases) 下载，作为同一安装界面的目标或上述 add 命令的参数。

默认 bundle 以空 instances/providers 加载。在 profile 的 cordis.patch.yml 中，将现有 sap-ai-core 条目的 config 设为 [cn40 五模型预设](examples/cn40-qwen/multi-models.json)，填写 OAuth host，并在 DSH credentials 中配置引用的 client ID 和 secret。预设只读查找唯一的 RUNNING Orchestration 部署；随后选择 SAP AI Core cn40 和所需 Qwen 模型。多个候选时填写已有的共享 Deployment ID。

继续使用单模型直连接口时，可使用原 [Chat Completions 配置 patch](examples/cn40-qwen/cordis.patch.yml)。升级时保留已有 provider/model ID，例如本地 qwen-cn40 仍代表 Qwen 3.6 Plus。

从源码构建：

~~~sh
npm ci --ignore-scripts
npm run test:pack
~~~

产物为 artifacts/dsh-sap-ai-core-0.1.0-rc.2.tgz，校验清单为 artifacts/manifest.json。DSH profile 需要提供 llm 和 credentials 服务。

[配置说明](docs/configuration.md) 包含凭证、两种明确协议、可选 Agent peers、代理/CA 和 Kubernetes Secret 示例。插件独立用于 DSH，复用已有 SAP 部署。

## 诊断

~~~sh
./node_modules/.bin/dsh-sap-ai-core-diagnose \
  --config /absolute/path/plugin.json \
  --provider sap-ai-core-demo --model qwen-demo --level config
~~~

config、auth、deployment 不发起模型推理。chat、stream、tools 必须加 --allow-inference；最多 4 个请求，每次至多请求 256 output tokens。工具诊断运行真实 DSH Agent。明确的 service key 可通过 --service-key FILE --instance ID 仅在内存导入。更多用法见 [运维说明](docs/operations.md)；开发入口为 npm run diagnose -- --help。

## 验证命令

| 命令 | 范围 |
| --- | --- |
| npm run typecheck | TypeScript 类型检查 |
| npm run test:unit | Token 生命周期、URL 和路由 |
| npm run test:contract | SSE、工具 JSON、usage、代理/TLS |
| npm run test:integration | 实际 DSH Agent、Loader、重试和诊断 |
| npm run test:pack | 禁用安装脚本的干净 tgz 安装、bundle 空配置、注册/选择/卸载、Agent 与 CLI |
| npm run build | 编译 dist；npm pack 也先执行编译 |

CI 默认只执行确定性测试，不读取公司凭证。主传输为 undici + eventsource-parser；OpenAI SDK 仅用于开发对照，选择依据见 [ADR 001](docs/adr-001-transport.md)。

真实 cn40 短测试需显式启用，最多 12 次请求，每次 128 output tokens，使用 enable_thinking=false：

~~~sh
SAP_AICORE_LIVE=1 npm run test:live:cn40 -- --connection .local/cn40-connection.json
~~~

自然到期测试保留同一个 Agent 和内存 Token，等待真实 expires_in 加 60 秒后验证新步骤；当前约需 12 小时：

~~~sh
SAP_AICORE_LIVE=1 npm run test:live:expiry -- --connection .local/cn40-connection.json
~~~

五模型 Orchestration 验证使用已有部署与显式 service key，最多 24 次请求、每次至多 128 output tokens；包含并发流式、每个模型读取随机校验码的 DSH 工具闭环、中文上下文跨模型续接和取消后恢复。测试配置的 retryPolicy.maxRetries 必须为 0：

~~~sh
SAP_AICORE_LIVE=1 npm run test:live:orchestration -- \
  --config /absolute/path/cn40-five-models.json --provider sap-ai-core-cn40 \
  --service-key /absolute/path/service-key.json --instance cn40
~~~

思考选项的专门验收最多 35 次请求：简单算术回答上限为 32 tokens，工具阶段回答上限为 128、思考预算为 64。逐档验证日常思考预算，并设置每响应 4096 字符、45 秒及已知输出总计 12000 tokens 的保护；达到保护会使检查失败，已知 Token 总量超限时停止后续阶段。它验证五模型的关闭/低/中/高设置，以及思考模式的工具闭环：

~~~sh
SAP_AICORE_LIVE=1 npm run test:live:thinking -- \
  --config /absolute/path/cn40-five-models.json --provider sap-ai-core-cn40 \
  --service-key /absolute/path/service-key.json --instance cn40
~~~

可选的本机 BYO 联合测试（不属于独立插件验收门槛）：

~~~sh
SAP_AICORE_LIVE=1 node --import tsx scripts/test-kagent-live.ts \
  --connection .local/cn40-connection.json \
  --kagent-package /absolute/path/dsh-kagent.tgz
~~~

该测试把两个包安装到临时目录，最多 8 次请求，验证批准/拒绝、工具 ID、会话续接和取消；不替代平台 UI 验收。[联合边界与证据](docs/kagent-integration.md)。

本地 kind Pod 脚本为 scripts/test-kubernetes-live.ts，必须显式提供 --connection、--kubeconfig、--context、--cluster、--kind。只接受本机 API 的 kind context。SAP_AICORE_LIVE=1 后用临时 Namespace/Secret 验证只读根目录、环境代理及真实 auth/deployment/stream，最多 1 次推理，随后删除 Namespace 和 Secret。构建镜像不含凭证。

真实报告只保存脱敏统计至 .local，不进入 tgz 或 Git。本插件使用 [MIT 许可](LICENSE)，通过 GitHub 源码和 Release tgz 交付；未发布 npm。未验证的模型能力见 [兼容矩阵](docs/compatibility.md)。
