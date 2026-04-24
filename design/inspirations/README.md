# Design Inspirations

把你看到好看的网页截图放在这里，Claude 触发 `screenshot-to-ui` skill 时会先读这个目录。

## 命名约定

```
YYYY-MM-DD-<简短描述>.png
```

例子：
- `2026-04-24-invoice-landing.png`
- `2026-05-10-apple-pricing-page.jpg`

## 可选：同名 markdown 备注

和截图同名的 `.md` 文件里可以写：

```markdown
url: https://example.com
likes:
  - 配色的克制
  - testimonial 区域的留白
  - phone mockup 的光影
notes:
  - 我想照这个 hero 做 OfferLens 的首屏
```

## 工作流

1. 把截图丢进这个目录
2. 跟 Claude 说 "照最新的那张做" 或 "照 2026-04-24 那张的 hero 做"
3. Claude 会走 `screenshot-to-ui` skill，读图 → 写组件 → 给你用法
