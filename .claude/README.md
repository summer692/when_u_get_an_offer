# .claude/

本目录存放项目级的 Claude Code 配置。

## skills/

项目专属 skill，Claude 会自动发现并在匹配的场景下调用。

- `screenshot-to-ui/` — 把网页截图复刻成本项目的 React + Tailwind 组件
- `ask-codex/` — 把问题打包成 codex CLI 命令，让用户在本地终端跑后贴回（绕开沙箱网络限制）
