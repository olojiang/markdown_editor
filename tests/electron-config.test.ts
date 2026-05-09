import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Electron build configuration', () => {
  it('emits CommonJS scripts so sandboxed preload can load', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      type?: string;
      main?: string;
      scripts?: {
        'build:mac'?: string;
      };
      build?: {
        productName?: string;
        mac?: {
          icon?: string;
          target?: Array<{
            target?: string;
            arch?: string[];
          }>;
          fileAssociations?: Array<{
            ext?: string[];
            role?: string;
            rank?: string;
          }>;
        };
      };
    };
    const electronTsConfig = JSON.parse(fs.readFileSync('tsconfig.electron.json', 'utf8')) as {
      compilerOptions: { module?: string };
    };

    expect(packageJson.type).not.toBe('module');
    expect(packageJson.main).toBe('dist-electron/main.js');
    expect(packageJson.scripts?.['build:mac']).toContain('--arm64');
    expect(packageJson.scripts?.['build:mac']).not.toContain('--x64');
    expect(packageJson.build?.productName).toBe('Markdown 纪');
    expect(packageJson.build?.mac?.icon).toBe('build/icon.icns');
    expect(packageJson.build?.mac?.target?.[0]).toEqual(
      expect.objectContaining({
        target: 'dmg',
        arch: ['arm64'],
      }),
    );
    expect(packageJson.build?.mac?.fileAssociations?.[0]).toEqual(
      expect.objectContaining({
        ext: ['md', 'markdown', 'mdown'],
        role: 'Viewer',
        rank: 'Owner',
      }),
    );
    expect(electronTsConfig.compilerOptions.module).toBe('CommonJS');
  });

  it('keeps the sandboxed preload free of Node built-in imports', () => {
    const preloadSource = fs.readFileSync('electron/preload.ts', 'utf8');

    expect(preloadSource).not.toMatch(/from ['"]node:/);
    expect(preloadSource).not.toMatch(/require\(['"]node:/);
  });

  it('uses the product name in the packaged document title', () => {
    const indexHtml = fs.readFileSync('index.html', 'utf8');
    const mainSource = fs.readFileSync('electron/main.ts', 'utf8');

    expect(indexHtml).toContain('<title>Markdown 纪</title>');
    expect(indexHtml).toContain('img-src');
    expect(indexHtml).toContain('https:');
    expect(indexHtml).toContain('markdown-asset:');
    expect(indexHtml).toContain("connect-src 'self' http: https:");
    expect(mainSource).toContain("app.setName(appTitle)");
    expect(mainSource).not.toContain("const appTitle = 'Markdown Editor'");
  });

  it('keeps GUI-launched cloud uploads compatible with shell-defined tokens', () => {
    const mainSource = fs.readFileSync('electron/main.ts', 'utf8');

    expect(mainSource).toContain("import { execFileSync } from 'node:child_process';");
    expect(mainSource).toContain('readPfSessionTokenFromShell');
    expect(mainSource).toContain("process.env.PF_SESSION_TOKEN?.trim() || readPfSessionTokenFromShell()");
  });

  it('keeps preview scrolling vertical and centers the cloud upload dialog', () => {
    const stylesSource = fs.readFileSync('src/renderer/styles.less', 'utf8');

    expect(stylesSource).toContain('overflow-x: hidden;');
    expect(stylesSource).toContain('overflow-y: auto;');
    expect(stylesSource).toContain('grid-template-rows: minmax(0, 1fr);');
    expect(stylesSource).toContain('html,\nbody,\n#app');
  });

  it('quits on macOS window close and supports synchronous session saving', () => {
    const mainSource = fs.readFileSync('electron/main.ts', 'utf8');
    const preloadSource = fs.readFileSync('electron/preload.ts', 'utf8');

    expect(mainSource).toContain("app.on('window-all-closed', () => {\n  app.quit();\n});");
    expect(mainSource).toContain("ipcMain.on('session:save-sync'");
    expect(mainSource).toContain("import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell");
    expect(mainSource).toContain("'markdown:reveal-in-folder'");
    expect(mainSource).toContain('shell.showItemInFolder');
    expect(mainSource).toContain("'Alt+Shift+I'");
    expect(mainSource).toContain("window.webContents.toggleDevTools()");
    expect(mainSource).toContain("mainLog('devtools.shortcut-toggle'");
    expect(mainSource).toContain("'markdown-editor-debug.log'");
    expect(mainSource).toContain("'app:confirm-close-sync'");
    expect(mainSource).toContain("'app:debug-log'");
    expect(preloadSource).toContain("ipcRenderer.sendSync('app:confirm-close-sync'");
    expect(preloadSource).toContain("ipcRenderer.invoke('app:debug-log'");
    expect(mainSource).toContain("let rendererReadyForExternalOpen = false;");
    expect(mainSource).toContain("'markdown:ready-for-external-open'");
    expect(mainSource).toContain("fileURLToPath");
    expect(mainSource).toContain("markdownPathFromLaunchValue");
    expect(mainSource).toContain("let launchMarkdownPathConsumed = false;");
    expect(mainSource).toContain("launchMarkdownPathConsumed ? null : markdownPathFromArgv(process.argv)");
    expect(mainSource).toContain("window.webContents.on('before-input-event'");
    expect(mainSource).toContain("'markdown:toggle-editor-shortcut'");
    expect(mainSource).toContain('buildApplicationMenu');
    expect(mainSource).toContain("label: '文件'");
    expect(mainSource).toContain("label: '插入'");
    expect(mainSource).toContain("label: '资源'");
    expect(mainSource).toContain("'app:menu-command'");
    expect(preloadSource).toContain("ipcRenderer.on('app:menu-command'");
    expect(preloadSource).toContain("ipcRenderer.sendSync('session:save-sync'");
    expect(preloadSource).toContain("notifyReadyForExternalOpen");
    expect(preloadSource).toContain("ipcRenderer.on('markdown:toggle-editor-shortcut'");
  });
});
