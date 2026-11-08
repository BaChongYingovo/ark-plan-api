# ark-plan-api

> 一个 DeepSeek Harness 插件（bundle）：装好后，火山方舟 **Ark** 的 Agent Plan / Coding Plan / 后付费 API 会直接出现在 DSH 的模型选择列表里，你只需要填一个 API Key。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4a90d9.svg)](https://github.com/BaChongYingovo/ark-plan-api)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

*English: `ark-plan-api` registers five Volcengine Ark provider routes (Agent Plan, Coding Plan, post-paid, CN and BytePlus) on DSH's native pi-ai adapter via a `cordis.patch.yml` bundle patch. You supply only an API key — no code, no build step.*

---

## 为什么需要它

DSH 原生支持"在设置里手填 provider"，但每个 Ark 套餐都要自己抄 Base URL、协议、模型 id 和上下文长度，抄错一个字段就连不上。这个插件把这些配置**作为设置的 base 层**预先写好：装完即用，你在 UI 里填的 Key 会正好落到每个 route 读取的位置。

默认协议是 **Anthropic Messages API**（`anthropic-messages`）——Ark 的 plan / coding 端点讲的就是这个协议。

## 已注册的 Route

| Route（Provider ID）       | 定位            | Base URL                                                    | 协议                 |
| -------------------------- | --------------- | ----------------------------------------------------------- | -------------------- |
| `ark-agent-plan-cn`        | Agent Plan      | `https://ark.cn-beijing.volces.com/api/plan`                | `anthropic-messages` |
| `ark-coding-plan-cn`       | Coding Plan     | `https://ark.cn-beijing.volces.com/api/coding`              | `anthropic-messages` |
| `ark-coding-plan-byteplus` | Coding Plan 海外 | `https://ark.ap-southeast.bytepluses.com/api/coding`        | `anthropic-messages` |
| `ark-cn`                   | 后付费 API      | `https://ark.cn-beijing.volces.com/api/v3/compatible`       | `anthropic-messages` |
| `ark-byteplus`             | 后付费 API 海外  | `https://ark.ap-southeast.bytepluses.com/api/v3/compatible` | `anthropic-messages` |

> Base URL **不含** `/v1` 后缀：pi-ai 把它交给 Anthropic SDK，由 SDK 自己追加 `/v1/messages`。

预置模型（可在 `cordis.patch.yml` 里自由增删）：

| Route | 模型 |
| --- | --- |
| `ark-agent-plan-cn` | `doubao-seed-evolving`、`doubao-seed-2.1-pro`、`doubao-seed-2.1-turbo`、`doubao-seed-2.0-lite`、`doubao-seed-2.0-mini`、`glm-5.3`、`kimi-k3`、`deepseek-v4-pro`、`deepseek-v4-flash`、`minimax-m3` |
| `ark-coding-plan-cn` | `doubao-seed-2.1-pro`、`doubao-seed-2.1-turbo`、`doubao-seed-evolving`、`doubao-seed-2.0-lite`、`glm-5.3`、`deepseek-v4-pro`、`deepseek-v4-flash`、`minimax-m3` |
| `ark-coding-plan-byteplus` | `doubao-seed-2.1-turbo`、`doubao-seed-2.1-pro` |
| `ark-cn` | `doubao-seed-2.1-pro`、`doubao-seed-2.1-turbo`、`doubao-seed-evolving` |
| `ark-byteplus` | `doubao-seed-2.1-turbo` |

`doubao-seed-*` 系列支持多模态（`input: [text, image]`）。

## 安装

### 方式一：从目录装入（推荐，可随时改源码）

```sh
git clone https://github.com/BaChongYingovo/ark-plan-api.git ~/dsh-plugins/ark-plan-api
dsh plugin --profile desktop add ~/dsh-plugins/ark-plan-api
dsh --profile desktop          # 重启 DSH
```

`dsh plugin add` 会把该目录写进 profile 的 `dependencies`，并自动加入 `bundles` 列表。

### 方式二：从 tarball 装入

```sh
npm pack                                  # 产出 ark-plan-api-0.1.0.tgz
dsh plugin --profile desktop add ./ark-plan-api-0.1.0.tgz
```

### 方式三：手动登记

编辑 `$DSH_HOME/profiles/<profile>/package.json`：

```jsonc
{
  "dependencies": {
    "ark-plan-api": "link:C:/Users/you/dsh-plugins/ark-plan-api"   // 或 file:...tgz
  },
  "dsh": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "ark-plan-api"                                                // ← 加这一行
    ]
  }
}
```

然后在 profile 目录执行 `pnpm install` 并重启。

### 检查是否装好

```sh
dsh --profile desktop --dump-config | grep -A2 llm-pi-ai     # 应看到 "patched by ark-plan-api"
```

卸载：`dsh plugin --profile desktop remove ark-plan-api`。

## 填 API Key

启动后打开 **设置 → 模型（Models）**，选中一个 Ark route（例如 *Ark Agent Plan*），粘贴对应套餐的 Key 即可，随后就能在对话框里选该 provider 下的模型。

Key 的落点由每个 route 的 `apiKeyEnv` 决定，用的是 DSH 的派生规则：

```js
PROVIDER_ID.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
// ark-agent-plan-cn -> ARK_AGENT_PLAN_CN_API_KEY
```

所以在 UI 里保存的 Key 会正好写进 route 读取的凭据名（`$DSH_HOME/.credentials.yaml`）。你也可以改用环境变量提供同名 Key，例如 `ARK_AGENT_PLAN_CN_API_KEY=...`。

各套餐 Key 的获取入口（火山方舟控制台）：

- Agent Plan：<https://console.volcengine.com/ark/region:cn-beijing/openManagement?advancedActiveKey=agentPlan>
- Coding Plan：<https://console.volcengine.com/ark/region:cn-beijing/openManagement?advancedActiveKey=subscribe>
- 后付费 API Key：<https://console.volcengine.com/ark/region:cn-beijing/apikey>

## 工作原理

DSH 以"休眠"状态挂载了 `@deepseek-ai/dsh-llm-pi-ai`（零 provider）。本插件的 `cordis.patch.yml` 做两件事：

1. `insert` 一行属于本 bundle 的空载插件（`ark-plan-api`，`index.js` 导出 `name` / `apply`，`apply` 是空函数）——这样插件在 **设置 → 插件 → 插件列表** 里有一个真实条目和活跃 fiber（宿主只枚举 Loader 条目），也满足插件市场"声明的入口文件必须存在"的要求。
2. 给 `llm-pi-ai` 那一行补上 `config.providers`，作为设置的 **base 层**。设置服务会把它和用户的 `settings.yaml` **按 provider 逐键深合并**，因此：
   - 安装后 provider 立刻出现在原生模型列表；
   - 你在"设置 → 模型"里手加的 provider 与它共存；
   - 你在 yaml 里覆盖某个 route 的字段，只影响那个 route。

行 patch 会整行替换目标行的 `config`；`dsh-base` 挂载 `llm-pi-ai` 时没有 config，所以这里只写 `providers` 是安全的。

## 自定义

直接改 `cordis.patch.yml`，重启后生效：

```yaml
ark-cn:
  displayName: Ark (后付费)
  apiKeyEnv: ARK_CN_API_KEY          # 换名字 = 换一个凭据槽位
  api: anthropic-messages            # 也可改 pi-ai 支持的其他协议
  baseURL: https://ark.cn-beijing.volces.com/api/v3/compatible
  models:
    - id: doubao-seed-2.1-pro        # 方舟上的真实模型 id / 推理接入点 ep-xxx
      name: Doubao Seed 2.1 Pro      # 选择器里显示的名字
      contextWindow: 256000
      maxTokens: 65536
      input: [text, image]
```

- **加模型**：在对应 route 的 `models` 里加一条；`id` 也可以填 `ep-xxxxxxxx` 形式的推理接入点。
- **加地区/新套餐**：复制一整个 route 块，换 provider id、`apiKeyEnv`、`baseURL`。
- **想用 OpenAI 兼容协议**：把 `api` 改成 pi-ai 里对应的 id，并把 `baseURL` 指向兼容端点。

改完跑一遍自检（见下），能提前发现 id 拼错、Key 名对不上这类问题。

## 常见问题

**装完模型列表里没有 Ark？**
1. 确认 profile 对了：`dsh --profile <name> --dump-config` 里 `llm-pi-ai` 行应显示 *patched by ark-plan-api*；
2. 确认插件在 `dsh.bundles` 里，而不只是 `dependencies`；
3. 改完要重启宿主进程，Web 端刷新页面即可。

**401 / 模型不存在？**
Key 属于哪个套餐就选哪个 route。拿 Agent Plan 的 Key 去调 `ark-cn`（后付费）会认证失败，反之亦然。

**会覆盖我自己加的 provider 吗？**
不会。这些只是 base 层默认值，与你在 UI 里加的 provider 逐键深合并；同名 route 时你的设置优先。

**插件会读我的 Key / 上传数据吗？**
`index.js` 是空函数，`apply` 什么都不做。插件只贡献配置，不发请求、不读凭据；请求全部由 DSH 自己的 pi-ai 适配器发出。

## 开发与自检

无第三方依赖，不需要构建。

```sh
npm run check     # 结构自检：入口可加载、patch 可解析、route/Key 名/模型字段自洽
npm pack          # 打 tarball
```

`scripts/check.mjs` 校验项：

- `index.js` 可 import，导出 `name` 与 `apply`；
- `package.json` 的 `dsh.bundle.patch` 指向真实文件，`files` 覆盖入口/patch/文档；
- patch 里每个 route 都有 `displayName` / `apiKeyEnv` / `api` / `baseURL` / `models`；
- `apiKeyEnv` 与 provider id 严格符合 DSH 的派生规则（否则 UI 里保存的 Key 会读不到）；
- `baseURL` 是 https 且不带 `/v1` 后缀；
- 每个模型都有 `id` / `name` / 正整数 `contextWindow` / 正整数 `maxTokens` / 合法 `input`；
- provider id、模型 id 在各自作用域内不重复。

## 验证记录

在已安装的 **DeepSeek Harness.app**（`@deepseek-ai/dsh@0.1.0-rc.5`、`@earendil-works/pi-ai@0.82.1`）上验证：

- 5 个 route 均通过 schema 与可服务性校验，正常出现在 `ctx.llm.listConfigurableProviders()` / `listProviders()` / `listModels()`；
- `dsh --dump-config` 显示该行 *patched by ark-plan-api*；
- 装入 bundle 后 web host 干净启动（无 loader 报错）；
- 用真实 Key 对 `ark-agent-plan-cn`（`doubao-seed-evolving`，`anthropic-messages`）**实测调通**，返回正文 + CoT 思考块。

## 安全说明

- 仓库不含任何 API Key；Key 由使用者在本地填写，落在 `$DSH_HOME/.credentials.yaml` 或环境变量。
- 请勿把 `--dump-config` 的完整输出或 `.credentials.yaml` 贴到 issue 里。

## License

[MIT](LICENSE) © 2026 BaChongYingovo

本项目与火山引擎 / BytePlus 无隶属关系，Ark、Doubao 等名称归其各自所有者。
