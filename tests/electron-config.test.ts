import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Electron build configuration', () => {
  it('emits CommonJS scripts so sandboxed preload can load', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      type?: string;
      main?: string;
      build?: {
        productName?: string;
        mac?: {
          icon?: string;
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
    expect(packageJson.build?.productName).toBe('Markdown 纪');
    expect(packageJson.build?.mac?.icon).toBe('build/icon.icns');
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
    expect(mainSource).toContain("app.setName(appTitle)");
    expect(mainSource).not.toContain("const appTitle = 'Markdown Editor'");
  });
});
