# dsh-kagent 联调边界

SAP 插件可以独立用于 DSH。2026-10-31 00:48（Asia/Shanghai）已将两个 tgz 安装进全新临时目录，完成真实 cn40 的本机 BYO HTTP 联合验证；实际 kagent 平台 UI/控制面和 Agent 间调用仍待验收。

同一个 DSH profile 挂载两个插件，kagent 仅选择 provider=sap-ai-core-demo、model=qwen-demo；SAP 凭证、Resource Group、wire model、Deployment 由 SAP 插件配置。两边不导入彼此内部模块。

kagent 通过公开 DSH agents 创建 Agent，提供工具及审批，向 Agent 发送 user message；SAP adapter 只把工具 schema、调用 ID、原始 JSON 和结果映射到模型协议。任务取消调用 DSH Agent.cancel，DSH 的 AbortSignal 继续传到 Token 等待、发现、推理及 SSE。kagent 显示 DSH usage 和 failure，不重复累计 Token。

本机验证使用 7 次模型请求。批准请求携带绑定的 request_id/call_id，实际 write 工具执行一次；拒绝后未写入。任务历史里的 function_call/function_response ID 一致。同 context 创建新 task，中文上下文保留。通过 message/stream 接收正文后发 tasks/cancel，A2A task 变为 canceled，SAP attempt 为 aborted，下一任务成功。

已测输入包 SHA-256：SAP 858a8e039ceeec0620122a8c9a477988908300b0d2e369a3b0509acd2f250025；kagent cc6a38891dc31055d1103c57272909fdb5f1c733541b7f5d703ea9e23d5c2c9a。测试后只保存脱敏统计至 .local/kagent-joint-report.json；临时安装、会话数据和受控文件均已删除。后续交付包仅更新文档/清单时其归档 SHA 会变化，运行时代码证据另见 compatibility.md。

平台具备后，S-L09 仍需在真实 UI 观察工具和审批展示，并通过平台任务执行/取消及 Agent 间调用补齐控制面链路。JSON-RPC 数据结构通过不等于 UI 通过。记录版本和脱敏统计，不记录凭证或业务工具参数。

S-L09 不作为独立 S5 的前置条件。kagent K5/K7 的实际就绪证据缺失前，不标记 S6 或整个项目完成。
