# dsh-sap-ai-core

SAP AI Core 的独立 DSH 模型插件。负责 OAuth、Token 缓存与轮换、Deployment 路由、OpenAI 兼容 Chat Completions、真实 SSE、工具增量、usage、错误和取消；Agent 循环与工具执行由 DSH 完成。

首个已验证环境是 cn40 qwen3.6-plus。中文多轮、流式、同一响应两个工具调用、工具回传、取消及并发已通过真实验证；独立候选版已安装到本地 DSH 并发布 GitHub Release，社区投稿待审核。Token 自然到期长测因刷新认证时网络失败而退出，尚未通过；随后直连认证和真实流式检查成功。kagent 的父 Agent 审批、页面恢复与平台任务管理属于可选集成，不作为本插件完成条件。完整状态见 [验收记录](docs/acceptance.md) 和 [实施进度](docs/progress.md)。

插件支持多个模型，DSH 选择器展示配置的逻辑模型及其对应部署。SAP 模型目录不等于当前账号已部署、可直接调用的模型；cn40 当前的目录、部署及接口边界见 [模型目录说明](docs/configuration.md#模型目录与可调用模型)。

## 使用

兼容 DSH 0.2.1-rc.5、Cordis 4.0.5、Node 24（24.19.0 起）。开发基线固定 Node 24.19.0 / npm 11.17.0。

在 DSH 的插件安装界面输入 GitHub 地址：

~~~text
https://github.com/solstice621/dsh-sap-ai-core
~~~

也可以使用 DSH 命令。桌面版先正常退出应用，再对 desktop profile 安装，完成后重新打开：

~~~sh
dsh plugin --profile desktop add github:solstice621/dsh-sap-ai-core#v0.1.0-rc.1
~~~

其他 CLI profile 将 desktop 换成实际名称。仓库提交了 dist 和 dsh.bundle，无需允许安装期构建脚本。预编译 tgz 也可从 [GitHub Releases](https://github.com/solstice621/dsh-sap-ai-core/releases) 下载，作为同一安装界面的目标或上述 add 命令的参数。

默认 bundle 以空 instances/providers 加载。将 [cn40 配置 patch](examples/cn40-qwen/cordis.patch.yml) 合并到该 profile 的 cordis.patch.yml，填写 OAuth host 与既有 Deployment ID；它更新已经安装的 sap-ai-core 条目。配置凭证引用后，选择 provider=sap-ai-core-demo、model=qwen-demo。凭证保存到 DSH credentials 服务或通过明确环境引用提供，不写入插件配置。

从源码构建：

~~~sh
npm ci --ignore-scripts
npm run test:pack
~~~

产物为 artifacts/dsh-sap-ai-core-0.1.0-rc.1.tgz，校验清单为 artifacts/manifest.json。DSH profile 需要提供 llm 和 credentials 服务。

[配置说明](docs/configuration.md) 包含通用模板、cn40 JSON、三层映射、可选 Agent peers、代理/CA 和 Kubernetes Secret 示例。插件不依赖 kagent，不创建 SAP 模型 Deployment，不接入 Orchestration。

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

可选的本机 BYO 联合测试（不属于独立插件验收门槛）：

~~~sh
SAP_AICORE_LIVE=1 node --import tsx scripts/test-kagent-live.ts \
  --connection .local/cn40-connection.json \
  --kagent-package /absolute/path/dsh-kagent.tgz
~~~

该测试把两个包安装到临时目录，最多 8 次请求，验证批准/拒绝、工具 ID、会话续接和取消；不替代平台 UI 验收。[联合边界与证据](docs/kagent-integration.md)。

本地 kind Pod 脚本为 scripts/test-kubernetes-live.ts，必须显式提供 --connection、--kubeconfig、--context、--cluster、--kind。只接受本机 API 的 kind context。SAP_AICORE_LIVE=1 后用临时 Namespace/Secret 验证只读根目录、环境代理及真实 auth/deployment/stream，最多 1 次推理，随后删除 Namespace 和 Secret。构建镜像不含凭证。

真实报告只保存脱敏统计至 .local，不进入 tgz 或 Git。本插件使用 [MIT 许可](LICENSE)，通过 GitHub 源码和 Release tgz 交付；未发布 npm。未验证的模型能力见 [兼容矩阵](docs/compatibility.md)。
