const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { signAndVerifyMacApp } = require('./sign-mac-app.cjs');

const unusedMacUsageKeys = [
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

function runPlistBuddy(plistPath, commands) {
  for (const command of commands) {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', command, plistPath], { stdio: 'ignore' });
  }
}

function deletePlistKey(plistPath, key) {
  try {
    runPlistBuddy(plistPath, [`Delete :${key}`]);
  } catch (error) {
    if (error && error.status === 1) {
      return;
    }
    throw error;
  }
}

function addMarkdownDocumentTypes(plistPath) {
  deletePlistKey(plistPath, 'CFBundleDocumentTypes');
  deletePlistKey(plistPath, 'UTImportedTypeDeclarations');

  runPlistBuddy(plistPath, [
    'Add :CFBundleDocumentTypes array',
    'Add :CFBundleDocumentTypes:0 dict',
    'Add :CFBundleDocumentTypes:0:CFBundleTypeName string Markdown Document',
    'Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Viewer',
    'Add :CFBundleDocumentTypes:0:LSHandlerRank string Owner',
    'Add :CFBundleDocumentTypes:0:LSItemContentTypes array',
    'Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string net.daringfireball.markdown',
    'Add :CFBundleDocumentTypes:0:LSItemContentTypes:1 string public.markdown',
    'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array',
    'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:0 string md',
    'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:1 string markdown',
    'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:2 string mdown',
    'Add :UTImportedTypeDeclarations array',
    'Add :UTImportedTypeDeclarations:0 dict',
    'Add :UTImportedTypeDeclarations:0:UTTypeIdentifier string net.daringfireball.markdown',
    'Add :UTImportedTypeDeclarations:0:UTTypeDescription string Markdown Document',
    'Add :UTImportedTypeDeclarations:0:UTTypeConformsTo array',
    'Add :UTImportedTypeDeclarations:0:UTTypeConformsTo:0 string public.text',
    'Add :UTImportedTypeDeclarations:0:UTTypeTagSpecification dict',
    'Add :UTImportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension array',
    'Add :UTImportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension:0 string md',
    'Add :UTImportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension:1 string markdown',
    'Add :UTImportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension:2 string mdown',
    'Add :UTImportedTypeDeclarations:0:UTTypeTagSpecification:public.mime-type string text/markdown',
  ]);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');

  for (const key of unusedMacUsageKeys) {
    deletePlistKey(plistPath, key);
  }
  addMarkdownDocumentTypes(plistPath);
  signAndVerifyMacApp(appPath);
};
