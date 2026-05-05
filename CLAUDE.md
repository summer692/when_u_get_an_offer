# OfferLens — 协作准则

## 永远不要猜

- 任何外部事实（模型 ID / 定价 / 第三方 API 行为 / 库的 API / 版本号 / URL 等）没核实过 → 直接说"我不清楚"，停下来问用户。不猜，不编。
- 代码内部的事实可以读文件确认；读不到 / 读不懂 → 也说不清楚。
- "可能 / 大概 / 我猜 / 应该是" 这类措辞是红线，触发就停下。

## 修复 bug 的方式

- 优先在结构上消除 bug 类别，而不是给单个 case 打补丁。
- 测试 pin 的是行为分支（决策树的某一条边），不是某份具体 offer 的措辞。
- 总测试数预期上限 ~25。再多说明在按数据扩张，要回头审视。

## CI / Deploy

- GitHub Pages 走 `.github/workflows/deploy.yml`，触发分支：
  - `claude/offer-extraction-tool-wkgz5`
  - `claude/design-offer-display-HY9o9`
- environment protection rules 要求分支显式加白名单才能 deploy，新分支记得在 GitHub repo settings → Environments → github-pages → Deployment branches 里加。
- workflow 现在跑 `pnpm test && pnpm build`，测试不过 deploy 会被拦。
