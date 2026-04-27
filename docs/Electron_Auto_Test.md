# Electron UI 自动测试方案

## 目标

Electron UI 自动测试用于验证真实桌面窗口能启动，preload 桥接能加载，关键控件能被自动化脚本访问。它补足 Vitest + jsdom 无法覆盖的部分，例如主进程入口、窗口创建、沙箱 preload、真实 DOM 可见性和跨进程启动链路。

## 技术方案

- 单元/组件测试：继续使用 `vitest` 与 `@vue/test-utils`，覆盖 Markdown 解析、目录树、会话状态、编辑器交互、搜索替换和快捷键。
- Electron UI 测试：使用 Playwright 的 `_electron` 启动能力，在构建后的应用入口上启动 Electron，并通过 Playwright locator 验证窗口中的控件。
- 配置文件：`playwright.electron.config.ts` 独立管理 Electron UI 测试，测试文件放在 `tests/electron/`。
- 执行入口：`pnpm test:electron` 先运行 `pnpm build`，再启动 Playwright Electron 测试，保证验证的是最新的 `dist/` 与 `dist-electron/` 产物。

## 实现方式

1. `pnpm build` 产出 renderer 与 Electron main/preload。
2. Playwright 执行 `electron.launch({ args: ['.'] })`。
3. Electron 根据 `package.json` 的 `main` 字段加载 `dist-electron/main.js`。
4. 主窗口加载生产构建的 `dist/index.html`。
5. 测试通过可访问角色与 `data-testid` 验证打开按钮、源码编辑区和预览区可见。

## 使用命令

```bash
pnpm test
pnpm test:electron
```

## 适用场景

- 修改 Electron `main.ts`、`preload.ts`、`package.json main` 或 TypeScript 输出格式后，验证窗口仍能启动。
- 修改安全配置、CSP、`contextIsolation`、`nodeIntegration` 或 preload bridge 后，验证 renderer 仍能访问受控 API。
- 修改核心布局、工具栏、编辑区、预览区后，验证关键 UI 控件仍可见。
- 发布前 smoke test，确认构建产物不是只在 Vite dev server 下可用。

## 不适用场景

- Markdown AST、目录过滤、搜索替换等纯逻辑，应优先放在 Vitest 单元测试中。
- 大量文本编辑边界和状态合并逻辑，应优先用组件测试覆盖，避免 Electron UI 测试变慢且难定位。
- 打包安装器、自动更新、系统菜单和原生文件选择器需要单独的发布验证流程。
