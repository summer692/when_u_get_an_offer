---
name: screenshot-to-ui
description: 当用户发来网页截图（可带 URL）并希望复刻其中的设计/组件时，按本 skill 的步骤把视觉元素拆解并实现为本项目的 React + Tailwind 组件。触发词示例：「照这个做」「抄这个 UI」「复刻这个风格」「把这个组件做出来」「做成这样」，或只要消息中带截图 + 涉及 UI/设计/组件修改的意图。
---

# Screenshot → UI 复刻

当用户发来一张网页截图（多数情况下附带或不附带原网址），按下面的步骤把视觉元素复刻成本项目的 React + Tailwind 组件。**目标是复刻设计语言和组件结构，不是 1:1 抄袭文案和图片资产。**

## 工作流

### 1. 读图 — 先观察再动手

用视觉语言逐层记录：
- **整体布局**：最大宽度、grid 列数、section 节奏、是否居中 / 左对齐
- **字体层级**：hero / h1 / h2 / body 的大致字号（px 或 rem）、字重、字距（letter-spacing）
- **配色**：主色、辅助色、中性色阶、文字色、背景色 — 都用十六进制记录下来
- **间距**：section 之间、卡片内部、元素之间的 padding / gap
- **装饰**：圆角半径、阴影层数与柔度、边框粗细
- **图像策略**：是否有 photography、screenshot-on-physical-object、phone mockup、overlay、渐变
- **组件级元素**：hero、feature grid、testimonial、comparison table、pricing、phone mockup、FAQ accordion、CTA、footer
- **动效暗示**：hover 状态、滚动入场、视差

看不清的细节明确说出来，不要瞎编数值。

### 2. 有 URL 就交叉验证

如果用户给了 URL，用 `WebFetch` 拉 HTML + CSS：
- 确认字体栈 (`font-family`)
- 提取 CSS 变量 / Tailwind 类（常见的 `--color-*`、`--spacing-*`）
- 看真实的断点和 section 高度

**不要盲信 LLM 估算**。能从源站取到精确值就取。

### 3. 对齐本项目的设计系统

写组件之前**必先读** `tailwind.config.js` 和 `src/index.css`，看已有 token：
- `colors.accent` / `colors.ink.*`
- `rounded-card`（20px）
- `shadow-card` / `shadow-card-dark`
- `ease-apple`、`fade-up`、`section-label`
- 字体栈 `font-display` / `font-text`
- `btn-primary` / `btn-ghost` / `card` 复合类

**能复用就不新增**。确实需要新 token（例如新的 accent 次级色）才去 `tailwind.config.js` 加，并且告诉用户加了什么。

### 4. 拆组件 — 一个文件一个

放在 `src/components/`，命名要描述性强：
- `TestimonialQuote.tsx`、`FeatureGrid.tsx`、`ComparisonTable.tsx`
- `PhoneMockup.tsx`、`FAQAccordion.tsx`、`PricingCard.tsx`
- 避免 `Section1.tsx` 这种无意义名

**Props 约定**：
- 文案、图片 URL、icon 全部走 props，不在组件里写死
- 数组类型数据（如 features、faq items）用 TS 接口定义清楚

### 5. 响应式是硬要求

桌面 + 手机两套布局都要实现，用 Tailwind `md:` `lg:` 断点。手机上：
- 多列 grid → 单列
- hero 字号缩小（已有 `text-hero` 就用它，它本身 clamp 了）
- 卡片铺满宽度

### 6. 暗色模式

每个新组件都要兼顾 `dark:`。文字用 `text-ink-900 dark:text-ink-100`，卡片用 `bg-white dark:bg-ink-900`，边框 `border-ink-100 dark:border-ink-700`。

### 7. 集成

- 如果用户没明确说挂到哪个页面，**不要擅自修改现有路由或页面**
- 写完组件后告诉用户：文件路径 + 一段 `<UsageExample />` 代码片段 + 有没有新加 token
- 问用户想挂到哪里（新路由 / 替换 Hero / 加到 Dashboard 下方 / 其他）

### 8. 诚实

- 截图看不清就说看不清，别编 px
- 不用占位 emoji 代替真实 icon — 用 inline SVG 或 `lucide-react`（先问是否同意加依赖）
- 图片资产不要从截图里直接猜 URL；用 placeholder div 或问用户提供
- 不要把截图里的版权文案（公司名、logo）照抄进代码

## 参考素材

用户可能把截图丢到 `design/inspirations/`。动手前先 `ls design/inspirations/` 看看最新文件。文件名约定：`YYYY-MM-DD-<描述>.png`，可选同名 `.md` 记录原网址和用户喜欢的点。

## 输出规范

每次复刻完，回复里包含：
1. **读图笔记**（配色 hex、字号、布局要点 — 不超过 10 行）
2. **新建/修改的文件清单**
3. **用法示例**（一段可粘贴的 JSX）
4. **新增的 Tailwind token**（如果有）
5. **截图里看不清 / 不确定的点**（让用户补充）

## 不要做的事

- ❌ 不要一次性改掉整个 `App.tsx` 的结构（除非用户明确说"整页替换"）
- ❌ 不要为每个组件自动新建路由
- ❌ 不要在组件里加中英文混杂的无用注释（"// 这里是 hero"）
- ❌ 不要抄截图里的具体商业文案到 OfferLens —— 改成适配 OfferLens 语境的文案（用户是留学生 / offer 场景）
