const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function requireValue(value, label) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${label}`);
  }
  return String(value).trim();
}

function notarizeAndStapleMacApp(appPath) {
  const resolvedAppPath = path.resolve(requireValue(appPath, 'app path'));
  const keyPath = requireValue(process.env.APPLE_API_KEY_PATH, 'APPLE_API_KEY_PATH');
  const keyId = requireValue(process.env.APPLE_API_KEY, 'APPLE_API_KEY');
  const issuer = requireValue(process.env.APPLE_API_ISSUER, 'APPLE_API_ISSUER');
  const uploadPath = path.join(os.tmpdir(), `${path.basename(resolvedAppPath, '.app')}-notary-${Date.now()}.zip`);

  fs.rmSync(uploadPath, { force: true });
  execFileSync('ditto', ['-c', '-k', '--keepParent', resolvedAppPath, uploadPath], { stdio: 'inherit' });

  const submitOutput = execFileSync('xcrun', [
    'notarytool',
    'submit',
    uploadPath,
    '--key',
    keyPath,
    '--key-id',
    keyId,
    '--issuer',
    issuer,
    '--wait',
    '--output-format',
    'json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

  process.stdout.write(submitOutput);
  const submitResult = JSON.parse(submitOutput);
  if (submitResult.status !== 'Accepted') {
    if (submitResult.id) {
      execFileSync('xcrun', [
        'notarytool',
        'log',
        submitResult.id,
        '--key',
        keyPath,
        '--key-id',
        keyId,
        '--issuer',
        issuer,
      ], { stdio: 'inherit' });
    }
    throw new Error(`Apple notarization failed with status: ${submitResult.status || 'unknown'}`);
  }

  execFileSync('xcrun', ['stapler', 'staple', resolvedAppPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'validate', resolvedAppPath], { stdio: 'inherit' });
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=4', resolvedAppPath], { stdio: 'inherit' });
  fs.rmSync(uploadPath, { force: true });
}

if (require.main === module) {
  notarizeAndStapleMacApp(process.argv[2]);
}

module.exports = {
  notarizeAndStapleMacApp,
};
