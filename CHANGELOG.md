# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 0.2.0 — 2026-11-08

新增**填 API Key 的页面**，并把「仓库里不许出现 Key」变成可自检的约束。

- 新增浏览器半侧 `client.js`：向插件管理页的 `plugins.row.config` 插槽注册 `ark-plan-api#ark-plan-api`，
  在 插件 页该行行尾提供「填 API Key」入口（每套餐一张卡片，显示凭据名与「已配置 / 未配置」）；
- 保存 / 清除走宿主的 `ctx.remote.credentials`（`describe` / `set` / `unset`），Key 只进
  `$DSH_HOME/.credentials.yaml`，不进插件文件、不进 profile 配置、不进日志，页面不回显；
- 宿主未暴露凭据服务时页面明示「去设置 → 模型 填」，不假装保存成功；
- `package.json` 声明 `dsh.client.platform = "web"` 与 `exports["./client"]`；
- 新增 `scripts/check-client.mjs`：用假 window / 假 React / 假凭据服务真跑一遍 bundle，
  覆盖注册 key、5 条 route 的凭据名、页面文案、保存 trim、空值拦截、宿主拒绝透传、清除与状态读取；
- 新增 `scripts/scan-secrets.mjs`：扫工作区、`*.tgz` 与 **git 全部历史**，拦截 `ark-`+40 位 / `sk-`+24 位 / UUID /
  `*_API_KEY = 真值` 这类写法，并禁止凭据文件入库；
- `scripts/check.mjs` 增加浏览器半侧结构校验（`dsh.client`、`exports["./client"]`、
  `__ModuleLoader__`、插槽 key 与 patch 行 id 对齐、client 凭据名与 patch `apiKeyEnv` 双向一致）；
- `npm test` 串起三个自检。

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
