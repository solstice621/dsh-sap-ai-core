# dsh-kagent 联调边界

SAP 插件可以独立用于 DSH。2026-10-31 00:48（Asia/Shanghai）已将两个 tgz 安装进全新临时目录，完成真实 cn40 的本机 BYO HTTP 联合验证。01:19–02:11 的实际平台验收通过直接 UI 批准/拒绝、刷新、usage、取消和父 Agent 委托批准。父 Agent 的拒绝转发、累计 usage 与审批卡状态仍未关闭，见 [平台验收发现](kagent-platform-findings.md)。S6 尚未通过。

同一个 DSH profile 挂载两个插件，kagent 仅选择 provider=sap-ai-core-demo、model=qwen-demo；SAP 凭证、Resource Group、wire model、Deployment 由 SAP 插件配置。两边不导入彼此内部模块。

kagent 通过公开 DSH agents 创建 Agent，提供工具及审批，向 Agent 发送 user message；SAP adapter 只把工具 schema、调用 ID、原始 JSON 和结果映射到模型协议。任务取消调用 DSH Agent.cancel，DSH 的 AbortSignal 继续传到 Token 等待、发现、推理及 SSE。kagent 显示 DSH usage 和 failure，不重复累计 Token。

本机验证使用 7 次模型请求。批准请求携带绑定的 request_id/call_id，实际 write 工具执行一次；拒绝后未写入。任务历史里的 function_call/function_response ID 一致。同 context 创建新 task，中文上下文保留。通过 message/stream 接收正文后发 tasks/cancel，A2A task 变为 canceled，SAP attempt 为 aborted，下一任务成功。

已测输入包 SHA-256：SAP 858a8e039ceeec0620122a8c9a477988908300b0d2e369a3b0509acd2f250025；kagent cc6a38891dc31055d1103c57272909fdb5f1c733541b7f5d703ea9e23d5c2c9a。测试后只保存脱敏统计至 .local/kagent-joint-report.json；临时安装、会话数据和受控文件均已删除。后续交付包仅更新文档/清单时其归档 SHA 会变化，运行时代码证据另见 compatibility.md。

S-L09 剩余复验针对父 Agent 的拒绝转发、累计 usage 与审批卡最终状态。JSON-RPC 数据结构通过不等于 UI 通过。记录版本和脱敏统计，不记录凭证或业务工具参数。

S-L09 不作为独立 S5 或独立插件发布的前置条件。父 Agent 问题复验关闭前，不标记 S6 或整个项目完成。

## 平台验收准备

scripts/prepare-kagent-platform.ts 消费两个已验证 tgz 和明确的 cn40 插件配置，构建独立验收镜像及 Helm values。它不读取 service key，不部署资源，也不触发推理；输出目录必须尚不存在。

~~~sh
node --import tsx scripts/prepare-kagent-platform.ts \
  --config .local/cn40-plugin.json --provider sap-ai-core-cn40 --model qwen-cn40 \
  --sap-package artifacts/dsh-sap-ai-core-0.1.0-rc.1.tgz \
  --kagent-package ../dsh-kagent/.cache/pack/dsh-kagent-0.1.0.tgz \
  --out .local/kagent-platform --namespace kagent --agent-name sap-cn40-check
~~~

镜像仅使用已安装包的公开入口。验收 monitor 经 DSH plugin API 提供明确环境凭证引用、128-token 单请求上限、最多 12 次模型请求及脱敏统计；仅允许指定的合成文件 write，审批仍由真实 DSH/kagent 完成。Pod 更新时从持久卷恢复已使用的预算和统计，不因重启清零。该 monitor 是测试夹具，不是插件的生产依赖。健康检查不发模型请求。

生成的 values 引用独立的 sap-cn40-check-auth 和 sap-cn40-check-sap Secret；凭证应通过显式本地 kubeconfig 和 stdin 创建，不保存 Secret manifest。只在已授权的本地 kind 集群、已安装并验证的平台补丁上部署；不得使用本机默认公司 kube context。验收后读取 /var/lib/dsh/sap-acceptance.json 的统计，再删除自己的 Agent、Secret、ConfigMap 和 PVC，保留其他测试资源。kindnet 不执行 NetworkPolicy，准备文件关闭了该本地夹具的策略，不能将其当作生产网络配置。

Agent 间调用使用真实 kagent Go ADK 父 Agent 和 tests/live/platform-parent-model.mjs 的确定性模型夹具。该夹具只返回受控的委托指令，父 Agent 通过标准 Agent tool 调用真实 cn40 子 Agent；付费请求全部计入同一个 SAP monitor 预算。父 Agent 的模型本身不使用 SAP 凭证、不调用外网，也不伪造模型 usage。夹具作为只读 ConfigMap 挂载，以独立的随机 Secret 验证内部请求；仅公开 /health 做无模型健康检查。批准和拒绝均需从真实平台 UI 完成，不能将直接调用子 Agent 冒充父 Agent 验收。
