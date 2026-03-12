# 贡献指南

感谢你对 YunyaClaw 的关注！

## 开发环境

- Node.js 22+
- pnpm

```bash
pnpm install
pnpm dev
```

## 提交变更

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/xxx` 或 `fix/xxx`
3. 提交变更，建议使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式
4. 推送分支并创建 Pull Request

## 代码风格

- TypeScript 严格模式
- 使用项目内已有的 Tailwind / shadcn 等约定
- 注释与文档使用中文

## 子模块

`openclaw/` 为 git submodule，修改核心逻辑请到 [openclaw/openclaw](https://github.com/openclaw/openclaw) 提交。
