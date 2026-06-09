const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const defaultIdentity = 'Developer ID Application: Pine Field Inc (Y8JR7FG9SR)';
const defaultKeychain = path.join(process.env.HOME || '', 'Library/Keychains/apple-build-signing.keychain-db');
const defaultEntitlements = path.join(rootDir, 'build/entitlements.mac.plist');

function requireValue(value, label) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${label}`);
  }
  return String(value).trim();
}

function envFlag(name) {
  return /^(?:1|true|yes|on)$/i.test(process.env[name] || '');
}

function isTimestampFailure(output) {
  return /\btimestamp\b/i.test(output);
}

function signAndVerifyMacApp(appPath) {
  const resolvedAppPath = path.resolve(requireValue(appPath, 'app path'));
  const identity = requireValue(process.env.MAC_CODESIGN_IDENTITY || defaultIdentity, 'MAC_CODESIGN_IDENTITY');
  const keychain = requireValue(process.env.MAC_CODESIGN_KEYCHAIN || defaultKeychain, 'MAC_CODESIGN_KEYCHAIN');
  const entitlements = requireValue(process.env.MAC_CODESIGN_ENTITLEMENTS || defaultEntitlements, 'MAC_CODESIGN_ENTITLEMENTS');
  const requireTimestamp = envFlag('MAC_CODESIGN_REQUIRE_TIMESTAMP');
  const frameworksDir = path.join(resolvedAppPath, 'Contents/Frameworks');

  const runCodesign = (args) => {
    const result = spawnSync('codesign', args, { encoding: 'utf8' });
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const error = new Error(`codesign failed with exit code ${result.status}`);
      error.output = `${result.stdout || ''}${result.stderr || ''}`;
      throw error;
    }
  };

  const signCode = (targetPath, useEntitlements = false) => {
    const args = [
      '--force',
      '--options',
      'runtime',
      '--timestamp',
    ];

    if (useEntitlements) {
      args.push('--entitlements', entitlements);
    }

    args.push('--sign', identity, '--keychain', keychain, targetPath);
    try {
      runCodesign(args);
    } catch (error) {
      if (requireTimestamp || !isTimestampFailure(String(error.output || error.message))) {
        throw error;
      }

      console.warn(`codesign timestamp unavailable for ${targetPath}; retrying without timestamp for local non-notarized build.`);
      runCodesign(args.filter((arg) => arg !== '--timestamp'));
    }
  };

  const find = (...args) => execFileSync('find', args, { encoding: 'utf8' })
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  if (fs.existsSync(frameworksDir)) {
    for (const dylibPath of find(frameworksDir, '-type', 'f', '-name', '*.dylib')) {
      signCode(dylibPath);
    }

    for (const executablePath of [
      path.join(frameworksDir, 'Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler'),
      path.join(frameworksDir, 'Squirrel.framework/Versions/A/Resources/ShipIt'),
    ]) {
      if (fs.existsSync(executablePath)) {
        signCode(executablePath);
      }
    }

    for (const frameworkPath of find(frameworksDir, '-type', 'd', '-name', '*.framework').sort().reverse()) {
      signCode(frameworkPath);
    }

    for (const helperAppPath of find(frameworksDir, '-type', 'd', '-name', '*.app').sort().reverse()) {
      signCode(helperAppPath, true);
    }
  }

  signCode(resolvedAppPath, true);

  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', resolvedAppPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--display', '--verbose=4', resolvedAppPath], { stdio: 'inherit' });
}

if (require.main === module) {
  signAndVerifyMacApp(process.argv[2]);
}

module.exports = {
  signAndVerifyMacApp,
};
