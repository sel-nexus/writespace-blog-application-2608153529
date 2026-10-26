# WriteSpace

A responsive, plain-text blog **demonstration** built with React 18, Vite, JavaScript/JSX, React Router 6 and Tailwind CSS. Discover local posts, register/sign in, write and manage your own posts, or use local administration. There is no application backend, API or database.

## Important limitations

**Never enter real passwords or sensitive information.** Account passwords are plaintext in this browser's localStorage. The built-in demonstration account is username `admin`, password `admin`. Client-side role/ownership checks are bypassable and are not security controls. This is not a production authentication or shared publishing system.

Records are per-origin and per-browser-profile under `writespace_users`, `writespace_posts`, and `writespace_session`. They are not uploaded, synchronized, backed up, or shared between visitors. Clearing browser data removes them. Concurrent tabs have no merge/locking guarantee. Unreadable records render safe empty states without destructive repairs; failed writes and partial account/session writes are reported honestly.

## Local development

Requires Node 22.14+ and npm. Application code is self-contained in `frontend/`.

```bash
cd frontend
npm ci --no-bin-links
npm run dev -- --host 0.0.0.0 --port 5173
```

No application secrets or runtime configuration are needed. `frontend/.env.example` documents optional shell variables `E2E_PORT` and `E2E_BASE_URL`; export them to change the browser-test server configuration. These are test settings, not runtime SPA secrets.

## Verification

From `frontend/`:

```bash
npm test
npm run coverage
node node_modules/@playwright/test/cli.js install chromium
npm run e2e
npm run build
```

Scripts call the Node package entry points directly, so the project also works where npm binary symlinks are disabled. Vitest and Testing Library test storage, validation, session/route rules, UI interactions, ownership, confirmation, and failure states. Playwright launches the real Vite server, uses browser localStorage, tests click-through journeys and reloads, and fails on console/page errors. Screenshots and traces are written to `frontend/test-results/`. `test_report.yaml` in the delivery workspace contains the actual run results; a generated test spec is not itself proof that it ran.

## Routes

- `/`: public landing and latest three local previews.
- `/login`, `/register`: guest forms; signed-in identities redirect to role home.
- `/blogs`, `/blog/:id`, `/write`, `/edit/:id`: signed-in collection, reader, create and edit. Users manage only their own posts; admins may manage all local posts.
- `/admin`, `/users`: local admin dashboard and account management. Guests go to login; non-admins go to blogs.

Built-in and active administrator accounts cannot be deleted. Other account and post deletions require explicit confirmation. Post text is escaped and whitespace is preserved.

## Static container

From the repository root:

```bash
docker build -t writespace-static frontend
docker run --rm -p 8080:80 writespace-static
```

The image compiles `frontend/dist` with Node and serves immutable assets through nginx on port 80. `GET /` is the liveness path. nginx returns the SPA document for direct client routes; it has no backend proxy. Runtime environment variables do not alter a built SPA.

The assembled delivery pipeline targets AWS ECR/ECS with ALB/CloudFront. This repository supplies the frontend image and route fallback; AWS provisioning and deployment verification belong to DevOps. The source also requires a rewrite-only `vercel.json`; for Vercel configure Root Directory `frontend` and supply that rewrite in the host project configuration. The file is retained at repository root as the upstream compatibility artifact, not a claim that AWS and Vercel are the same deployment.

## Open product/release decisions

1. Confirm AWS versus the original Vercel target before production.
2. Define the fourth dashboard metric. Until then its card position has no invented label or value, and the UI explains the gap.
3. Supply exact built-in-account tooltip copy if required. No literal tooltip wording is fabricated.
4. AWS staging root/deep-link health, ALB/CloudFront delivery, network LCP and forecast-based load testing must be verified after deployment; they are not local test claims.

## Source organization

`src/utils/` owns guarded persistence, sessions, permissions and post ordering. `src/components/` contains shared navigation, form, avatar, post/stat/account presentation. `src/pages/` composes each product feature. `src/main.jsx` owns the sole BrowserRouter; `src/App.jsx` composes routes and page-local session state. No Context or external state manager is used. Fonts and the discovery photograph are served locally.
