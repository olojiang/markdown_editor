# 改进 Apple 签名构建脚本记录

记录时间：2026-05-24

## 问题

运行 `./update_app.sh` 构建 macOS ARM64 包时，在 `electron-builder` 的 `afterPack` 签名阶段失败：

```text
libEGL.dylib: replacing existing signature
libEGL.dylib: errSecInternalComponent
Command failed: codesign --force --options runtime --timestamp --sign Developer ID Application: Pine Field Inc (Y8JR7FG9SR) --keychain /Users/hunter/Library/Keychains/apple-build-signing.keychain-db ...
```

失败位置是：

```text
scripts/sign-mac-app.cjs -> signCode()
scripts/after-pack.cjs -> signAndVerifyMacApp()
pnpm build:mac -> electron-builder afterPack
```

## 原因

`update_app.sh` 之前只读取 `/Users/hunter/Workspace/apple_keys/apple_key_metadata.env` 并设置 `MAC_CODESIGN_*` 环境变量，没有在 `pnpm build:mac` 之前准备签名 keychain。

因为 `afterPack` 会在构建过程中立刻调用 `codesign`，所以此时必须已经满足这些条件：

- `~/Library/Keychains/apple-build-signing.keychain-db` 存在。
- keychain 已经解锁。
- `Developer ID Application: Pine Field Inc (Y8JR7FG9SR)` 已经导入 keychain。
- 已执行 `security set-key-partition-list -S apple-tool:,apple:,codesign:`，允许 `codesign` 非交互访问私钥。
- 该 keychain 已在 user keychain search list 中。

如果缺少解锁或 partition list，GUI 环境可能弹出密码框；非交互脚本里通常会失败为：

```text
errSecInternalComponent
```

## 参考材料

复用了本机签名材料目录：

```bash
/Users/hunter/Workspace/apple_keys
```

关键文件：

```text
apple_key_metadata.env
apple_key_secrets.env
developer_id_application_pine_field_modern.p12
import_into_keychain.sh
sign_apple_notarize.md
collect_convert_import_apple_key.md
```

`apple_keys/import_into_keychain.sh` 中已经验证过可用的 keychain 准备流程，本次将同类流程内置到 `markdown_editor/update_app.sh`，避免每次构建前依赖人工手动执行导入脚本。

## 改进方法

`update_app.sh` 现在会在 `pnpm build:mac` 之前执行 `prepare_signing_keychain`：

1. 读取 `apple_key_metadata.env` 和 `apple_key_secrets.env`。
2. 校验 `APPLE_CERTIFICATE_ID`、`APPLE_CERTIFICATE_PASSWORD`、`MODERN_P12`、notary API key 等必要值。
3. 默认使用：

   ```bash
   ~/Library/Keychains/apple-build-signing.keychain-db
   ```

4. 如果 keychain 文件不存在，创建它；如果已存在，直接复用。
5. 解锁 keychain，并设置 21600 秒超时。
6. 确保 keychain 在 user keychain search list 中。
7. 如果签名身份不存在，则从 `developer_id_application_pine_field_modern.p12` 导入。
8. 每次构建前刷新 key partition list。
9. 再次用 `security find-identity -v -p codesigning` 确认签名身份可用。
10. 导出 `MAC_CODESIGN_KEYCHAIN` 指向已准备好的 keychain，然后才运行 `pnpm build:mac`。

## 使用方式

普通本地更新：

```bash
cd /Users/hunter/Workspace/markdown_editor
./update_app.sh
```

构建、签名、公证、staple 并做 Gatekeeper 校验：

```bash
cd /Users/hunter/Workspace/markdown_editor
./update_app.sh --sign
```

如果签名材料放在其他目录：

```bash
APPLE_KEYS_DIR=/path/to/apple_keys ./update_app.sh
```

如果需要覆盖 keychain：

```bash
MAC_CODESIGN_KEYCHAIN="$HOME/Library/Keychains/another-signing.keychain-db" ./update_app.sh
```

## 验证

脚本语法检查：

```bash
bash -n update_app.sh
```

签名脚本语法检查：

```bash
node -c scripts/sign-mac-app.cjs
node -c scripts/after-pack.cjs
node -c scripts/notarize-mac-app.cjs
```

keychain 身份检查：

```bash
security find-identity -v -p codesigning "$HOME/Library/Keychains/apple-build-signing.keychain-db"
```

预期包含：

```text
Developer ID Application: Pine Field Inc (Y8JR7FG9SR)
```

如果仍然失败，先单独运行：

```bash
cd /Users/hunter/Workspace/apple_keys
./import_into_keychain.sh
```

然后回到项目重新执行：

```bash
cd /Users/hunter/Workspace/markdown_editor
./update_app.sh
```

## 注意事项

- 不要把 `apple_key_secrets.env`、`.p12`、`.p8` 或 updater 私钥提交到 git。
- 不要用 `security show-keychain-info` 判断 keychain 是否存在；锁定或状态异常也可能让它返回失败。脚本应以 keychain 文件路径是否存在作为存在性判断。
- `errSecInternalComponent` 经常不是二进制文件本身的问题，而是 keychain/私钥访问权限没有准备好。
- `afterPack` 已经会签名 app，`update_app.sh` 后续再调用 `node scripts/sign-mac-app.cjs "$BUILT_APP"` 是二次签名验证路径；如果之后想优化构建时间，可以再评估是否保留二次签名。
