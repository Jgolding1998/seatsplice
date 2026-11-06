# Crewboard

Crewboard is a team formation service for a single hackathon. Participants can discover open teams, request a seat, or share an expiring invitation. Team leaders approve applicants and manage membership. The board reflects committed changes without a reload.

## Run it

Use Node.js 22 or later. Node 24 is the tested version. From the repository root:

```sh
npm ci
npm run build
npm run demo -- --seed
```

Open http://127.0.0.1:4173 and create an account. The preview runs on loopback and starts a temporary MongoDB replica set. On the first run it may download a MongoDB binary. The sample crews show what a busy board looks like. Their fictional owners cannot sign in. To exercise approvals, create your own team, open a second browser profile or private window, register a different account, and request a seat. Stop the preview with Ctrl+C.

For a persistent development database, copy `.env.example` to `.env`, point it at a MongoDB replica set, then run `npm run dev` and `npm run ui` in separate terminals. Open the Vite URL at `http://localhost:5173`. The API is proxied through Vite.

## Verify it

```sh
npm test
npx playwright install chromium
npm run build
npm run test:browser
npm run load
```

The API tests use a temporary MongoDB replica set and two HTTP app instances. The browser suite drives the built app on loopback. Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) for the load test or set `K6_BIN` to its executable. The runner starts its own local database, seeds 10,000 fictional participants and 2,000 teams, and runs the checked-in scenario against that local server. `npm run seed` is also available for a database whose name ends in `_fixtures`.

## Deploy

The production build serves React and the Express API on one origin. Use a MongoDB replica set or MongoDB Atlas with a dedicated application database user. Keep `MONGO_URL` and `INVITE_SECRET` in your host's secret settings. Generate the latter with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep the same invite secret across instances and restarts.

The [Render blueprint](render.yaml) supplies the build and start commands, HTTP health check, and environment configuration. For another host, set `NODE_ENV=production`, `APP_ORIGIN` to the public HTTPS origin, and `TRUST_PROXY` to the exact trusted proxy hop count. Set the database and invite secrets, build with `npm ci --include=dev && npm run build`, then start with `npm start`. Verify that the host forwards the real client IP and streams `/api/events` without buffering it. For a public demo, provision disposable review accounts or let reviewers register and use two browser profiles.

## Submission notes

- [Design note](docs/DESIGN.md)
- [Benchmark report](docs/LOAD-TEST.md)
- [Walkthrough outline](docs/WALKTHROUGH.md)
- [Security review and tested boundaries](docs/SECURITY.md)
- [Design and tooling references](docs/RESOURCES.md)

The app uses original product code with standard open-source libraries. Claude Code contributed the React client and reviewed the backend. Codex implemented the backend, regression tests, and final design and verification passes. Reviewers can reproduce the last-seat proof by running `npm test` and inspecting the named concurrency case in `tests/api.test.js`.
