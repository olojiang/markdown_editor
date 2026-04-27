import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Electron build configuration', () => {
  it('emits CommonJS scripts so sandboxed preload can load', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      type?: string;
      main?: string;
    };
    const electronTsConfig = JSON.parse(fs.readFileSync('tsconfig.electron.json', 'utf8')) as {
      compilerOptions: { module?: string };
    };

    expect(packageJson.type).not.toBe('module');
    expect(packageJson.main).toBe('dist-electron/main.js');
    expect(electronTsConfig.compilerOptions.module).toBe('CommonJS');
  });
});
