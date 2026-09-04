import fs from 'node:fs';

export const sessionBackupCount = 3;

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
