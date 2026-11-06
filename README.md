# Boyun-interface

Functional browser assets for [Boyun-core](https://github.com/Boyun-Protocol/Boyun-core): scenario setup, model access review, saved results, reports, wallet controls and the advanced lab. This repository contains the app interface, not the marketing website.

## Install with core

Clone Boyun-core and Boyun-interface into sibling directories. From Boyun-core:

```sh
uv run --project engine --extra pdf --with-editable ../Boyun-interface decision-lab serve --port 8769
```

Open http://127.0.0.1:8769/. The core package owns the HTTP/API server and security rules. This package supplies `boyun_interface/assets` through Python package resources, so wheel installs work without a source-tree path. It has no dependency on core and starts no server or model request when imported.

## Layout

- `src/boyun_interface/assets`: functional HTML, CSS, JavaScript, wallet SDK and licensed fonts.
- `tests`: UI state/dispatch regressions and disclosed synthetic core example fixtures.
- `tools`: pinned wallet SDK rebuild and its package lock.

## Checks and builds

```sh
uv run --with pytest python -m pytest tests -q
for check in tests/*.cjs; do node "$check"; done
uv build
cd tools
npm ci
node build.mjs
```

Node.js is required for UI regressions and SDK rebuilding. Wallet SDK legal notices and font licenses remain beside their assets. Runtime requests and signing remain explicit; tests do not perform chain transactions or funded inference.

## License

AGPL-3.0-only for first-party code. See [NOTICE](NOTICE) and the wallet/font notices for third-party terms. Pricing proposals, launch copy, promotional screenshots and the standalone landing site stay local.
