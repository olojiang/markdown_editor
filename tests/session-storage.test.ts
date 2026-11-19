import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  recoverableSessionBackupIndex,
  rotateSessionBackupsSync,
  sessionBackupPath,
  sessionShutdownWasCleanSync,
  writeSessionShutdownStatusSync,
} from '../electron/session-storage';

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

describe('session storage', () => {
  it('recovers the newest valid backup only when the primary session is invalid', () => {
    expect(recoverableSessionBackupIndex(false, [false, true, true])).toBe(1);
    expect(recoverableSessionBackupIndex(false, [true, true, false])).toBe(0);
  });

  it('does not replace a valid primary with an older session that happens to have more tabs', () => {
    expect(recoverableSessionBackupIndex(true, [true, true])).toBeNull();
    expect(recoverableSessionBackupIndex(false, [false, false])).toBeNull();
  });

  it('records whether the previous application shutdown completed cleanly', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-editor-session-'));
    temporaryDirectories.push(directory);
    const markerPath = path.join(directory, 'clean-shutdown');

    expect(sessionShutdownWasCleanSync(markerPath)).toBeNull();
    writeSessionShutdownStatusSync(markerPath, false);
    expect(sessionShutdownWasCleanSync(markerPath)).toBe(false);
    writeSessionShutdownStatusSync(markerPath, true);
    expect(sessionShutdownWasCleanSync(markerPath)).toBe(true);
  });

  it('retains the previous three session versions in newest-first order', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-editor-session-'));
    temporaryDirectories.push(directory);
    const sessionPath = path.join(directory, 'markdown-session.json');

    for (let version = 1; version <= 5; version += 1) {
      if (version > 1) {
        rotateSessionBackupsSync(sessionPath);
      }
      fs.writeFileSync(sessionPath, `version-${version}`, 'utf8');
    }

    rotateSessionBackupsSync(sessionPath);

    expect(fs.readFileSync(sessionBackupPath(sessionPath, 1), 'utf8')).toBe('version-5');
    expect(fs.readFileSync(sessionBackupPath(sessionPath, 2), 'utf8')).toBe('version-4');
    expect(fs.readFileSync(sessionBackupPath(sessionPath, 3), 'utf8')).toBe('version-3');
  });
});
