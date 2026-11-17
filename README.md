# Clerk Van Run

One lap in the Clerk Van through an alpine valley. Collect cookies, API keys and passkeys, beat
the clock and climb the public leaderboard. Built with Next.js 16, Three.js r186 and Clerk.

Design: [GDD.md](GDD.md). Asset licenses: [public/CREDITS.md](public/CREDITS.md).

## Develop

```sh
pnpm install
pnpm dev
```

- Clerk keys live in `.env.local`, written by `npx clerk@latest init`. Run
  `npx clerk@latest auth login` once to claim the accountless app into your workspace, then
  `npx clerk@latest env pull` (dev) or `npx clerk@latest env pull --instance prod`.
- The leaderboard needs `DATABASE_URL` (Postgres). The `runs` table is created on first use.
- `pnpm lint`, `pnpm typecheck`, `npx tsx scripts/check-validator.ts` (server-side run validation).
- Headless screenshots without a GPU: `node scripts/shots.mjs <outDir>` (drives a lap),
  `node scripts/views.mjs <outDir>` (fixed cameras), `node scripts/pages.mjs <outDir>`.
  `?lite` in the URL forces the phone quality tier.

## Play

WASD or arrows, Space to brake, R to restart, M to mute. On phones: touch buttons.
Score = items (cookie 10, API key 50, passkey 100) × 1.5 when the three `<SignIn/>` pieces are
collected, plus 5 points per second under 2:00. Spam bots steal 3 cookies on contact.

## Deploy

Docker image from `Dockerfile` (Next.js standalone). Environment: the Clerk variables above
plus `DATABASE_URL`. Heavy assets under `/models`, `/textures` and `/audio` are served with
a one-year cache header. The reference deployment runs on Dokploy with a Postgres 17 service
in the same project.
