# Fork notes

This is `TunkShif/ncm-api`, a fork of
[NeteaseCloudMusicApiEnhanced/api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)
used by the `swirl-music` Android client.

Upstream has no release branch. Releases are **tags on `main`**, and the Docker image
(`moefurina/ncm-api`) is built from the commit that the tag points to.
This fork is based on `main` at `984cc02`, which is 8 commits **after** tag `v4.41.1`
(cookie parsing fixes among them), so the tag was not a better base.

## Branches

- `main` — untouched mirror of upstream. Do not commit here.
- `swirl` — our patch. Dokploy builds this branch.

## Why we patch

The upstream service is designed for personal local use. Exposed to the internet it has
four problems that configuration alone cannot fix:

1. The response cache key is `hostname + url + request cookies`. The POST body is not in
   the key, so `POST /user/playlist` with `uid=A` and then `uid=B` returns A's answer.
   Proof on the deployed instance: `docs/research/ncm-api.md`, section 7.1.
2. `Set-Cookie` is cached with the response body, so a cache hit can replay another
   request's cookie.
3. JSON and upload limits are 500 MB, and the upload middleware always runs.
4. The request URL, including `?cookie=`, is written to the log.

## Changes

| File | Change |
|------|--------|
| `middleware/auth.js` (new) | `X-Api-Token` check, constant-time compare, comma-separated token list |
| `util/ratelimit.js` (new) | in-memory fixed-window limit, keyed by token, no dependency |
| `server.js` | auth and limiter mounted before the cache; `X-Powered-By` off; `Set-Cookie` blacklisted from cache; body limit 8 MB; uploads behind `ENABLE_UPLOAD`; `cookie` redacted in logs; `BLOCKED_ROUTES`; `noCookie` parsed as a boolean |
| `util/apicache.js` | cache key covers request cookies, full body, query cookie, and token (hashed with SHA-256) |
| `.env.prod.example` | new variables documented |
| `Dockerfile` | two-stage build: dependencies in a throwaway stage, so the pnpm store is not shipped. Runtime image 217 MB instead of 296 MB |
| `.dockerignore` | add `!/middleware` and `!/pnpm-workspace.yaml`, drop `!/.env` |

Cache keys are hashed so that account cookies are not stored as plain strings in the
in-memory cache index.

`BLOCKED_ROUTES` matches by path segment. `/login/cellphone` blocks only that route.
`=/login` blocks exactly `/login` (email login) and keeps `/login/qr/key`, `/login/status`,
and `/login/refresh`. A bare `/login` without `=` would unregister the whole QR login flow.

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `API_TOKENS` | empty | comma-separated tokens. Empty disables the check and logs a warning |
| `RATE_LIMIT` | `300` | requests per window per token |
| `RATE_LIMIT_WINDOW_MS` | `60000` | window length |
| `MAX_BODY_SIZE` | `8mb` | JSON and form body limit |
| `MAX_UPLOAD_SIZE_MB` | `8` | per-file limit, only when uploads are on |
| `ENABLE_UPLOAD` | `false` | mount `express-fileupload` |
| `BLOCKED_ROUTES` | empty | comma-separated routes to unregister. `/foo` also blocks `/foo/bar`; `=/foo` is exact |
| `DISABLE_SET_COOKIE` | unset | when `true`, never send `Set-Cookie` |

Suggested production values:

```env
API_TOKENS=<token-a>,<token-b>
RATE_LIMIT=300
MAX_BODY_SIZE=8mb
ENABLE_UPLOAD=false
BLOCKED_ROUTES=/captcha,/login/cellphone,=/login,/register,/cloud,/audio/match,/avatar
DISABLE_SET_COOKIE=true
ENABLE_GENERAL_UNBLOCK=false
ENABLE_PROXY=false
ENABLE_RANDOM_CN_IP=false
```

The image runs as user `node` with `WORKDIR /app`.

`.dockerignore` uses a `/**` allow list, so a new top-level directory is **not** copied
until it is added. `middleware/` was missing, and the container failed at startup with
`Cannot find module './middleware/auth'`. If you add a directory, add it here too and check:

```bash
docker build -t ncm-api:local . && docker run --rm --entrypoint sh ncm-api:local -c 'ls /app'
```

`!/.env` was removed: a local `.env` would otherwise be baked into the image. Configuration
comes from the platform environment.

## Token model

The client bakes one shared token into the APK at build time, and the APK is distributed
privately. So all devices share one token and one rate-limit bucket. That is accepted at
this scale; the endpoint and token decision is recorded in `swirl-music`,
`docs/decisions/0001-ncm-api-hosting-and-credentials.md`.

Rotation needs a rebuild, so never swap a single token in one step:

1. `API_TOKENS=<old>,<new>` and redeploy. Both work; nobody is locked out.
2. Build and distribute the APK with `<new>`.
3. When every device runs the new build, set `API_TOKENS=<new>`.

Revoking a person therefore means the same thing as rotating for everyone. Per-user tokens
would allow individual revocation, but they need a settings screen that the client does not
have.

## Client rules that the server cannot enforce

- Send the NetEase cookie as a `Cookie:` header. A cookie in the query string still
  reaches Cloudflare logs, which this fork cannot redact.
- Send `X-Api-Token`.
- Add `timestamp=<ms>` to `/login/qr/*` and to any call that must be fresh (2-minute cache).

## Upgrade

```bash
git fetch upstream
git switch swirl
git rebase upstream/main
```

Conflicts are expected only in `server.js`, and only around the unblock block and the
cookie-selection block. Test after each rebase:

```bash
pnpm install --ignore-scripts
pnpm lint
pnpm exec mocha -r intelli-espower-loader -t 60000 main.test.js --exit
```

`server.test.js` calls the real NetEase API and fails on risk control. Do not use it as a
gate.

## Known limits

- The rate-limit map holds at most 2000 buckets and drops the oldest one under pressure.
  A flood from one caller cannot reset other callers' counters, but memory is not bounded
  by more than that.
- All users still share one egress IP toward NetEase. Heavy use raises the risk-control
  score for everyone.
- Upstream can change `server.js`. Keep the patch small and rebase often enough that the
  diff stays readable.
