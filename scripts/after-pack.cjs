const { execFileSync } = require('node:child_process');
const path = require('node:path');

const unusedMacUsageKeys = [
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const plistPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Info.plist');

  for (const key of unusedMacUsageKeys) {
    try {
      execFileSync('/usr/bin/plutil', ['-remove', key, plistPath], { stdio: 'ignore' });
    } catch (error) {
      if (error && error.status === 1) {
        continue;
      }
      throw error;
    }
  }
};
