# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YunyaClaw is an Electron desktop app wrapping OpenClaw (an AI assistant framework). Stack: Electron 40 + React 19 + TypeScript + Vite 7 + Tailwind CSS 4. Target platform: Windows 10/11 x64.

## Build & Dev Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Dev mode with HMR (Vite + Electron)
pnpm build:win        # Full Windows NSIS installer build
pnpm build:win-mini   # Lightweight installer (preferred for testing)
OPENCLAW_DEBUG=1 pnpm dev  # Debug mode (enables DevTools + verbose logging)
```

No test runner or linter is configured. No unit tests exist.

## Architecture

### Process Model

- **Main process** (`electron/main.ts`): Window management, IPC handlers (30+), spawns OpenClaw as child process (gateway on port 18789), config I/O, plugin/skill management
- **Preload** (`electron/preload.ts`): Context-isolated bridge exposing `window.electronAPI` with typed namespaces (gateway, window, config, chat, agents, persona, etc.)
- **Renderer** (`src/`): React SPA with page-based routing via state, no react-router

### Key Patterns

- **SPA routing**: `App.tsx` switches pages via `currentPage` state. `KeepAlive` component keeps inactive pages mounted to preserve state. AgentPage is always mounted (default page).
- **Context providers** (wrap entire app in App.tsx): `GatewayProvider` (subprocess status), `AgentProvider` (agent list/active), `AppearanceProvider` (app name/icon)
- **IPC convention**: Preload exposes `ipcRenderer.invoke('namespace:method')` → main handles via `ipcMain.handle('namespace:method')`
- **Config files** stored in `~/.openclaw/`: `openclaw.json` (OpenClaw config), `yunyaClaw.json` (app-specific), `.env` (API keys)
- **YunyaClaw config service**: Serialized write queue in main process to prevent concurrent write conflicts

### OpenClaw Integration

`openclaw/` is a git submodule — **never modify it directly**, submit changes upstream. OpenClaw runs as a Node.js subprocess (gateway). Communication is via HTTP to `localhost:{gatewayPort}`. The app bundles OpenClaw with its node_modules into `resources/openclaw-release/` at build time.

### Frontend Structure

- `src/pages/` — 9 page components (AgentPage, ModelsPage, SettingsPage, SkillsPage, IntegrationsPage, PersonaPage, CronPage, DashboardPage, AboutPage)
- `src/components/chat/` — Chat UI (ChatPanel, ChatInputBar, ChatMessageRow, MessageContent)
- `src/components/ui/` — shadcn-style primitives (button, input, select, switch, badge)
- `src/contexts/` — React Context for global state
- `src/global.d.ts` — TypeScript interfaces for ElectronAPI and shared types
- `src/config/default-providers.json` — Built-in AI provider definitions (Bailian/Qwen, DeepSeek, Zhipu)

### Plugin & Skill System

- Bundled plugins (`electron/bundled-plugins.ts`): QQ Bot, DingTalk — copied to `~/.openclaw/extensions/` on startup
- Bundled skills (`electron/bundled-skills.ts`): Playwright MCP, Self-Improvement — copied to `~/.openclaw/skills/`
- Build scripts in `scripts/` handle packaging these into `resources/`

## Code Conventions

- TypeScript strict mode
- Comments and UI text in Chinese
- Tailwind CSS 4 with shadcn-inspired component patterns
- Icons from lucide-react
- Conventional Commits for git messages
- Path alias: `@/` maps to `src/`
