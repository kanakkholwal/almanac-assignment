# Almanac Desktop

Electron + Vite + React desktop assistant for floating chat, push-to-talk capture, and meeting-oriented workflows.

## Development

1. Copy `.env.example` to `.env`.
2. Set `LITELLM_API_KEY`.
3. Run `pnpm install`.
4. Run `pnpm dev`.

## Production checks

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Packaging

- `pnpm dist:win`
- `pnpm dist:linux`

Artifacts are written to `release/`.

## Release process

1. Update the app version in `package.json`.
2. Update `.env.prod` with production values.
3. Run tests and build checks.
4. Run the platform packaging command.
5. Publish the generated artifacts plus update metadata to the URL configured under `build.publish`.

## Notes

- Auto updates are wired through `electron-updater` and controlled by `VITE_ENABLE_AUTO_UPDATE`.
- Runtime logs are written under the Electron `userData/logs` directory.
- Window bounds, mode, and always-on-top state are persisted under the Electron `userData` directory.
