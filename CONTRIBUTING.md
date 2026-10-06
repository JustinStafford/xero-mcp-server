# Contributing

Thanks for helping improve the Xero MCP server. This page explains how to set up the project, build it, and run the checks.

## Prerequisites

- Node.js 20 or later (Node 24 is used for development)
- npm 10 or later

## Install

Use `npm ci` so that you get the exact dependency versions from `package-lock.json`:

```bash
npm ci
```

## Environment variables

The Xero client reads its credentials at import time, so most commands need
`XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` (or `XERO_CLIENT_BEARER_TOKEN`) to be
set. Copy the example file and fill it in:

```bash
cp .env.example .env
```

For the test suite and the build, placeholder values are enough — no network
calls are made. Never commit a real `.env` file.

## Build

```bash
npm run build
```

This compiles TypeScript into `dist/` and makes the entry points executable.
Use `npm run watch` to rebuild on every change.

## Test

```bash
npm test
```

This runs Vitest once over every `src/**/*.test.ts` file. If you have not set
credentials, pass placeholders on the command line:

```bash
XERO_CLIENT_ID=dummy XERO_CLIENT_SECRET=dummy npm test
```

Use `npm run test:watch` while you develop.

## Lint

```bash
npm run lint
npm run lint:fix
```

## Before you open a pull request

1. `npm ci`
2. `npm run build`
3. `npm test`
4. `npm run lint`

All four must pass. Keep the change focused, add tests for new behaviour, and
describe in the pull request what you changed and how you checked it.
