# Clerk Van Run

One lap in the Clerk Van through an alpine valley. Collect cookies, API keys and passkeys, beat
the clock and climb the public leaderboard. Built with Next.js, Three.js and Clerk.

Design: [GDD.md](GDD.md). Asset licenses: [public/CREDITS.md](public/CREDITS.md).

## Develop

```sh
pnpm install
pnpm dev
```

Clerk keys live in `.env.local` (created by `npx clerk@latest init`). The leaderboard needs
`DATABASE_URL` pointing at Postgres.
