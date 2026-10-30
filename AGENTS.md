# dsh-sap-ai-core 开发说明

本文件适用于本目录及其子目录。用户当前指令优先；详细设计和验收依据见 [PLAN.md](PLAN.md)。相邻 `../dsh-kagent/` 是平台集成项目，本插件必须能独立用于 DSH。

## 开始工作

- 先读 PLAN.md，检查实际文件、依赖和当前进度，再确定本次阶段。初始化时仅有文档，不代表任何功能已经实现。
- PLAN 中的版本是调研基线或候选，配置、目录和脚本可能尚未实现。以固定版本源码、实际包和协议证据核对接口。
- 默认先完成 S0 的协议、复用和网络验证，再按 S1–S6 的依赖推进。阶段记录包括改动、验证命令、结果和未关闭的问题，退出条件满足后才标记完成。
- 复用现有 checkout；保留用户已有改动。查找文件和文本优先使用 rg。

## 项目边界

- 实现通用 SAP AI Core 模型插件，首版面向经过验证的 OpenAI 兼容 Chat Completions。cn40 Qwen 是首个验证配置，地区、地址、模型和 Deployment 均可配置。
- 本插件负责凭证、Token、部署路由、模型协议、能力、usage、错误及取消；DSH 负责 Agent 循环和工具执行。
- 不依赖 kagent，不导入配套插件内部模块，不创建模型 Deployment，不把 foundation-models 路径替换成 Orchestration 接口。
- 默认采用独立 LlmAdapter 加经过验证的客户端；S0 按 PLAN 六项条件评估 PiAiAdapter 复用。最终保留一个主传输实现，避免并行维护重复框架。
- 通过 DSH 公开接口注册 provider、读取凭证和输出 StreamChunk；不修改 SDK 原型或全局 fetch。

## 必须保持的行为

- 配置分 instance、provider route、logical model 三层；每次模型调用使用不可变配置快照，多实例和模型之间不能串路由或凭证。
- 凭证通过明确引用解析，不扫描桌面、下载目录或任意 service-key 文件。导入只读取用户指定的文件。
- OAuth 使用 client_credentials。缓存和单飞刷新按实例及凭证代次隔离；迟到 401 不能使新 Token 失效，取消一个等待者不能取消其他等待者的共享刷新。
- 一个 adapter.stream 对应一次推理 attempt；关闭 SDK 模型重试。通用重试由 DSH 负责，401 恢复在明确的失败步骤层有界执行，不在已输出部分内容后偷偷重放。
- 明确部署优先；只读发现要求唯一候选。零候选或多候选报错，不能选择列表第一项或在同次请求中悄悄换部署。
- 保留消息顺序、工具 ID、参数 JSON 和工具结果。支持多个交错工具增量；正文、reasoning、tool-call 分开。
- 尾部 usage 在 finish 前处理，同一 attempt 只累计一次；缓存输入与普通输入不重复计数，未知统计不臆造。
- 流中断和 in-band error 明确失败。取消贯穿 Token 等待、discovery、推理、SSE 和退避，并释放连接与计时器。
- 模型能力依据 exact route/model 的实测声明。未知或不支持的选项明确拒绝；buffered 响应不能当作真实 streaming 验收。
- URL、query、保留请求头和重定向有明确约束；不向未知主机转发凭证，不关闭 TLS 校验。

## 实现与验证

- 使用 TypeScript 和 Cordis/DSH 公开接口；S0 固定 Node、包管理器、DSH、SDK 和 HTTP 客户端版本，提交 lockfile。
- 按 PLAN 划分 auth、routing、protocol、transport 和 diagnostics；不让配置界面执行 OAuth secret 流程。
- 只运行已存在的脚本；新增脚本后同步文档，不能把拟定命令当作已经可用。
- 确定性测试使用本地 OAuth/推理 mock，覆盖并发刷新、轮换、迟到 401、取消、路由隔离、SSE 边界、工具增量、usage 和有界重试。
- 打包后在干净 DSH profile 安装、注册、选择、卸载，确认不依赖未发布内部源码。
- 真实验收覆盖聊天、中文多轮、真实增量、工具调用与结果回传、取消、Token 到期和独立会话并发。mock 成功不能证明 Qwen 实际能力。
- S5 独立验收不等待 kagent；S-L09 在 S6 联调，避免循环依赖。
- 记录实际支持矩阵及未验证项；仅验证 cn40 时不得声称所有 SAP AI Core 模型均兼容。更新 PLAN 阶段状态和相关配置/兼容文档。

## 本机环境与交付

- 需要浏览器时优先本机 Chrome 并复用登录会话；Chrome 无法完成时再说明原因并回退。
- 遵守用户现有代理守护策略。SAP 内网使用公司 HTTP 代理 `proxy.sha.sap.corp:8080`，仅在可达时使用；不要自行修改系统代理、VPN、DNS 或同时开启 FlClash TUN。
- 插件使用请求级网络配置并验证 HTTP_PROXY、HTTPS_PROXY、NO_PROXY 的实际效果，不假定 Node fetch 自动读取环境代理。
- 不把 Secret、Token、service key、业务 prompt 或工具参数写入 Git、日志、fixture 或镜像。示例只保存引用和占位值。
- config/auth/deployment/chat/stream/tools 诊断级别明确；健康检查不触发付费推理，live 测试显式启用并设置小预算，CI 默认不读取个人公司凭证。
- 真实模型、集群及发布操作按用户已授权范围执行；沿用已有授权，不因阶段切换重复询问。缺少必要环境时先完成独立工作并明确待验证项。
