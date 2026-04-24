# OfferLens

> 你的 offer，一眼看清。

上传学校录取通知（PDF / 图片 / DOCX / 邮件正文），自动抽取学校、关键日期、费用、必做事项，在仪表盘里倒计时显示。

## 特性

- **任意语言 offer** — 多模态 LLM 原生识别，不受语种限制
- **本地优先** — 文件解析与数据都只在浏览器里（IndexedDB），不上传服务器
- **响应式** — 桌面 + 移动端同样好用
- **浅色 / 深色 / 跟随系统** — 三种主题
- **OpenRouter 统一入口** — 默认 Gemini 2.5 Flash 免费层，一键切换 Claude Haiku / GPT-4o mini 等

## 使用

```bash
pnpm install
pnpm dev
```

打开 http://localhost:5173，点击右上角「设置」填入你的 [OpenRouter API Key](https://openrouter.ai/keys)，即可开始上传 offer。

## 技术栈

- Vite + React 18 + TypeScript
- Tailwind CSS（Apple 风设计系统）
- `pdfjs-dist` 解析 PDF · `mammoth` 解析 DOCX
- `idb` 封装 IndexedDB
- OpenRouter Chat Completions API（OpenAI 兼容协议）

## 目录结构

```
src/
  lib/          # 纯逻辑：schema / db / parsers / llm / countdown / format
  hooks/        # useOffers, useTheme
  components/   # Hero, Dashboard, OfferCard, OfferDetail, SettingsSheet, ...
  App.tsx       # 路由与状态编排
  main.tsx      # 入口
```

## Roadmap（MVP 之后）

- 多 offer 横向对比表
- `.ics` 日历导出、邮件/推送提醒
- 可选账号 + 云端同步
- 多语言界面（i18n）
- 原文 PDF 云端保存
