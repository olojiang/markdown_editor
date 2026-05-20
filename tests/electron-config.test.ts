import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Electron build configuration', () => {
  it('emits CommonJS scripts so sandboxed preload can load', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      type?: string;
      main?: string;
      scripts?: {
        'build:icon'?: string;
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
          identity?: string | null;
          hardenedRuntime?: boolean;
          entitlements?: string;
          entitlementsInherit?: string;
          fileAssociations?: Array<{
            ext?: string[];
            role?: string;
            rank?: string;
          }>;
        };
        win?: {
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
    expect(packageJson.scripts?.['build:icon']).toBe('node scripts/generate-mac-icon.cjs');
    expect(packageJson.scripts?.['build:mac']).toContain('pnpm build:icon');
    expect(packageJson.scripts?.['build:mac']).toContain('--arm64');
    expect(packageJson.scripts?.['build:mac']).not.toContain('--x64');
    expect(packageJson.build?.productName).toBe('Markdown 纪');
    expect(packageJson.build?.mac?.icon).toBe('build/icon.icns');
    expect(packageJson.build?.mac?.identity).toBeNull();
    expect(packageJson.build?.mac?.hardenedRuntime).toBe(true);
    expect(packageJson.build?.mac?.entitlements).toBe('build/entitlements.mac.plist');
    expect(packageJson.build?.mac?.entitlementsInherit).toBe('build/entitlements.mac.plist');
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
    expect(packageJson.build?.mac?.fileAssociations?.map((association) => association.ext)).toEqual([
      ['md', 'markdown', 'mdown'],
      ['html', 'htm'],
      ['txt', 'text'],
      ['json'],
    ]);
    expect(packageJson.build?.win?.fileAssociations?.map((association) => association.ext)).toEqual([
      ['md', 'markdown', 'mdown'],
      ['html', 'htm'],
      ['txt', 'text'],
      ['json'],
    ]);
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
    expect(indexHtml).toContain("frame-src 'self' http://127.0.0.1:*;");
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
    expect(mainSource).toContain('show: false');
    expect(mainSource).toContain("window.once('ready-to-show'");
    expect(mainSource).toContain('window.maximize()');
    expect(mainSource).toContain('window.show()');
    expect(mainSource).toContain("ipcMain.on('session:save-sync'");
    expect(mainSource).toContain("import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell");
    expect(mainSource).toContain("'markdown:reveal-in-folder'");
    expect(mainSource).toContain('shell.showItemInFolder');
    expect(mainSource).toContain("'app:open-external-link'");
    expect(mainSource).toContain("'html-preview:url'");
    expect(mainSource).toContain("htmlPreviewServer?.listen(0, '127.0.0.1'");
    expect(mainSource).toContain("const htmlPreviewIdSearchParam = 'markdown-preview-id'");
    expect(mainSource).toContain('window.webContents.setWindowOpenHandler');
    expect(mainSource).toContain("window.webContents.on('will-navigate'");
    expect(mainSource).toContain('openLinkOutsideApp');
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
    expect(preloadSource).toContain("ipcRenderer.invoke('app:open-external-link'");
    expect(preloadSource).toContain("ipcRenderer.invoke('html-preview:url'");
  });

  it('keeps the macOS local update path signed and relaunchable', () => {
    const afterPackSource = fs.readFileSync('scripts/after-pack.cjs', 'utf8');
    const signMacAppSource = fs.readFileSync('scripts/sign-mac-app.cjs', 'utf8');
    const notarizeMacAppSource = fs.readFileSync('scripts/notarize-mac-app.cjs', 'utf8');
    const updateAppSource = fs.readFileSync('update_app.sh', 'utf8');
    const clearReleaseSource = fs.readFileSync('clear_release.sh', 'utf8');

    expect(afterPackSource).toContain("require('./sign-mac-app.cjs')");
    expect(signMacAppSource).toContain("'--options'");
    expect(signMacAppSource).toContain("'runtime'");
    expect(signMacAppSource).toContain("'--timestamp'");
    expect(signMacAppSource).toContain("'--entitlements'");
    expect(signMacAppSource).toContain('Developer ID Application: Pine Field Inc (Y8JR7FG9SR)');
    expect(notarizeMacAppSource).toContain("'notarytool'");
    expect(notarizeMacAppSource).toContain("'submit'");
    expect(notarizeMacAppSource).toContain("'--wait'");
    expect(notarizeMacAppSource).toContain("'stapler'");
    expect(notarizeMacAppSource).toContain("'spctl'");
    expect(updateAppSource).toContain('pnpm build:mac');
    expect(updateAppSource).toContain('source "$APPLE_KEYS_DIR/apple_key_metadata.env"');
    expect(updateAppSource).toContain('--sign');
    expect(updateAppSource).toContain('NOTARIZE=false');
    expect(updateAppSource).toContain('NOTARIZE=true');
    expect(updateAppSource).toContain('node scripts/sign-mac-app.cjs "$BUILT_APP"');
    expect(updateAppSource).toContain('node scripts/notarize-mac-app.cjs "$BUILT_APP"');
    expect(updateAppSource).toContain('pkill -x "$APP_PROCESS_NAME"');
    expect(updateAppSource).toContain('cp -R "$BUILT_APP" "$TARGET_APP"');
    expect(updateAppSource).toContain('xcrun stapler validate "$TARGET_APP"');
    expect(updateAppSource).toContain('spctl --assess --type execute --verbose=4 "$TARGET_APP"');
    expect(updateAppSource).toContain('open "$TARGET_APP"');
    expect(clearReleaseSource).toContain('RELEASE_DIR="${ROOT_DIR}/release"');
    expect(clearReleaseSource).toContain('find "$RELEASE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +');
  });
});
