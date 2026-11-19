import fs from 'node:fs';
import path from 'node:path';

export const sessionBackupCount = 3;

export function recoverableSessionBackupIndex(
  primarySessionIsValid: boolean,
  backupIsValid: boolean[],
): number | null {
  if (primarySessionIsValid) {
    return null;
  }
  const index = backupIsValid.indexOf(true);
  return index === -1 ? null : index;
}

export function sessionShutdownWasCleanSync(markerPath: string): boolean | null {
  try {
    const status = fs.readFileSync(markerPath, 'utf8');
    return status === 'clean' ? true : status === 'unclean' ? false : null;
  } catch {
    return null;
  }
}

export function writeSessionShutdownStatusSync(markerPath: string, clean: boolean): void {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const temporaryPath = `${markerPath}.tmp`;
  fs.writeFileSync(temporaryPath, clean ? 'clean' : 'unclean', 'utf8');
  try {
    fs.renameSync(temporaryPath, markerPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function sessionBackupPath(sessionPath: string, index: number): string {
  return `${sessionPath}.bak.${index}`;
}

function removeIfExists(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export function rotateSessionBackupsSync(sessionPath: string, backupCount = sessionBackupCount): string[] {
  const backupPaths = Array.from({ length: backupCount }, (_, index) => sessionBackupPath(sessionPath, index + 1));

  for (let index = backupCount; index >= 1; index -= 1) {
    const targetPath = sessionBackupPath(sessionPath, index);
    const sourcePath = index === 1 ? sessionPath : sessionBackupPath(sessionPath, index - 1);
    removeIfExists(targetPath);
    try {
      fs.copyFileSync(sourcePath, targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return backupPaths.filter((filePath) => fs.existsSync(filePath));
}
