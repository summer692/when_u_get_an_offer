# Yesletter

> 你的 offer，一眼看清。

上传学校录取通知（PDF / 图片 / DOCX / 邮件正文），自动抽取学校、关键日期、费用、必做事项，在仪表盘里倒计时显示。

## 架构

- **前端** Vite + React 18 + TypeScript（GitHub Pages / Cloudflare Pages 静态托管）
- **后端** Cloudflare Worker（仓库内 `worker/`，holds Gemini API key + 验证 Turnstile + IP 限流）
- **LLM** Google Gemini 2.5 Flash-Lite（多模态，处理图片 / PDF / 文本）
- **本地存储** IndexedDB（offer 数据 + L2/L3 缓存）

## 本地开发

```bash
pnpm install
pnpm dev
```

打开 http://localhost:5173。如果没设 `VITE_API_BASE`，前端会回退到 BYOK 模式（用户填自己的 API key）；设了就走 Worker。

复制 `.env.example` 到 `.env.local` 配置。

## Worker 部署

见 `worker/README.md`——一次性配好 Cloudflare 账户、Turnstile、Gemini 付费 tier、KV 限流。

## 测试

```bash
pnpm test       # vitest 单元测试，覆盖 deterministic 后处理逻辑
pnpm typecheck
pnpm build
```

## 协作准则

见 `CLAUDE.md`。核心：永远不要猜外部事实，结构化修复 > 个案补丁。
