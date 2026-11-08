# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 0.1.0 — 2026-10-23

首个公开版本。

- 通过 `cordis.patch.yml` bundle patch 在 `@deepseek-ai/dsh-llm-pi-ai` 上注册 5 个火山方舟 route：
  `ark-agent-plan-cn`、`ark-coding-plan-cn`、`ark-coding-plan-byteplus`、`ark-cn`、`ark-byteplus`；
- 默认协议 `anthropic-messages`，Base URL 不含 `/v1`（由 Anthropic SDK 追加）；
- 内联预置 doubao-seed / glm / kimi / deepseek / minimax 等模型及其上下文长度；
- `apiKeyEnv` 按 DSH 派生规则生成，UI 里保存的 Key 正好落在 route 读取的凭据槽位；
- 附带空载入口 `index.js`，让插件在 *设置 → 插件* 列表中有真实条目；
- 新增 `scripts/check.mjs` 结构自检。

## 0.0.0 — 开发期

- 内部验证：schema、可服务性、`--dump-config` 行 patch 生效、bundle 装入后 web host 启动正常；
- 使用真实 Key 对 `ark-agent-plan-cn` + `doubao-seed-evolving` 调通（正文 + CoT）。
