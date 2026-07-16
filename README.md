# puckzone-frontend

React + Vite client for **PuckZone**, a real-time multiplayer air hockey web platform for
Colombian university students. It is the browser-facing piece of a 6-microservice
architecture — login, matchmaking lobby, and a 60Hz Canvas game rendered over a STOMP/SockJS
WebSocket, all talking exclusively to the gateway.

> PuckZone is an individual project for the Software Architectures course (ARSW) at
> Escuela Colombiana de Ingeniería Julio Garavito, term 2026-i.

## What this app does

- **Auth** — register (`.edu.co` email only) and login; JWT + refresh token kept in
  `localStorage`, access token silently renewed on `401` (shared single in-flight refresh,
  so concurrent polling requests don't trigger duplicate renewals).
- **Lobby** — shows the player's stats and a button to join the matchmaking queue.
- **Waiting room** — polls queue status; tolerates transient `NOT_IN_QUEUE` reads from
  matchmaking's assignment race, offers a bot opponent after the timeout, and lets the
  player accept the bot or keep waiting.
- **Game** — the actual match: 800×500 canvas (CSS-scaled), physics state received at 60Hz
  over `/topic/game/{id}` and kept in a ref + `requestAnimationFrame` (never `setState` at
  60Hz), paddle input sent via `/app/game/{id}/paddle`. Renders all 6 power-ups (obstacle,
  speed/slow zones, phantom puck, shield, chaos), an emote bar with hotkeys 1-6, a surrender
  button with confirmation, and reconnect/pause/abandon overlays.
- **Ranking** — global and university leaderboards.
- **Profile** — player stats and match history.

### Where it sits in the architecture

```
Browser ──HTTPS──▶ puckzone-gateway ──▶ auth · matchmaking · game (WS) · ranking
(this repo, static SPA served by nginx)
```

All six services: `puckzone-auth` (8081) · `puckzone-matchmaking` (8082) · `puckzone-game`
(8083) · `puckzone-ranking` (8084) · `puckzone-gateway` (8080) · **`puckzone-frontend`**
(5173 in dev). The frontend never calls a microservice directly — everything goes through
the gateway, including the WebSocket (`/ws?token=<jwt>`, since SockJS can't send an
`Authorization` header on the handshake).

## Tech stack

- React 19 + Vite, React Router 7
- `@stomp/stompjs` + `sockjs-client` for the game WebSocket
- Axios for REST calls, with request/response interceptors for JWT attachment and refresh
- Plain CSS, `<canvas>` for the game rendering (no game engine library)
- Docker multi-stage build (Node 22 → nginx 1.27-alpine), deployed to Azure Container Apps

## Project layout

```
src/
├── pages/
│   ├── Login/, Register/       # public routes
│   ├── Lobby/                  # stats + join queue
│   ├── Waiting/                # queue polling, bot offer
│   ├── Game/                   # canvas, physics loop, powers, emotes, surrender
│   ├── Ranking/                # global + university leaderboards
│   └── Profile/                # player stats + match history
├── services/
│   ├── api.js                  # axios instance: base URL, JWT header, 401-refresh-and-retry
│   ├── authService.js, matchmakingService.js, rankingService.js, gameService.js
│   └── gameSocket.js           # STOMP/SockJS connection, subscriptions, emote/paddle send
├── store/                      # AuthContext (session state)
├── hooks/                      # useAuth, usePing
└── components/                 # Header, ProtectedRoute
```

## Configuration

| Variable | Default (fallback) | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8080` | Gateway base URL. **Baked in at build time** (Vite only reads `VITE_*` at build), not read at runtime — this is why it's set as a GitHub Actions repo variable and passed as a Docker build arg, not a container env var |
| `VITE_TURN_URL` | *(empty — STUN only)* | Comma-separated TURN URLs for the in-game voice chat (e.g. Metered Open Relay). Without it, peers behind symmetric NAT/CGNAT can't connect voice. Baked at build time like `VITE_API_URL` |
| `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | *(empty)* | Static credentials for the TURN server above |

Session data (`puckzone_token`, `puckzone_refresh_token`, `puckzone_user`) lives in
`localStorage`.

## Running locally

Requires Node 22 and a running gateway (defaults to `http://localhost:8080`; start the
other 5 services first, or point `VITE_API_URL` at Azure).

```bash
npm install
npm run dev
```

The dev server runs on **port 5173** (the origin the gateway's `CORS_ALLOWED_ORIGINS`
must include).

```bash
npm run lint    # ESLint
npm run build   # production build to dist/
npm run preview # serve the production build locally
```

## Docker

```bash
docker build --build-arg VITE_API_URL=http://localhost:8080 -t puckzone-frontend .
docker run -p 8080:80 puckzone-frontend
```

Two-stage build: `npm ci && npm run build` on Node 22, then the static `dist/` is served
by nginx on port 80. `nginx.conf` does SPA fallback (`try_files … /index.html`, so a
refresh on `/lobby` doesn't 404) and long-lived caching for hashed assets under `/assets/`.

## Deployment

Deployed to **Azure Container Apps** as an externally-facing app (`puckzone-frontend`,
0.25 vCPU / 0.5Gi, 1 replica — static content, no state to scale) — it's the public URL
of the whole platform. Infra lives in `infra/app/` (Terraform, reads the shared
`base.tfstate` from puckzone-game for the resource group and Container Apps environment).

CI/CD (`.github/workflows/ci_frontend-service.yml`): lint + build on every push/PR;
on `main`, builds and pushes the Docker image to GHCR (tagged with both the short SHA and
`latest`, `VITE_API_URL` passed as a build arg from the repo variable of the same name),
then `az containerapp update --image …:<short-sha>` deploys it. The image tag is the git
SHA, not `latest`, so each deploy is a distinct revision and rollback is just re-pointing
to a previous tag.

## Known limitations

- `VITE_API_URL` must point at the gateway that will be reachable from the *user's
  browser* — changing it requires a rebuild (it's compiled into the bundle), not just a
  redeploy.
- No voice chat yet (planned as a future, larger addition on the game service side).
- Session refresh assumes a single tab; concurrent tabs each hold their own copy of the
  tokens in `localStorage` and can race on refresh across tabs.
