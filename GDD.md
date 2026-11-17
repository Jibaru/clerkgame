# Clerk Van Run: game design document

A one-lap time trial in the real Clerk Van through an alpine valley. You collect the icons of
Clerk (cookies, API keys, passkeys, the pieces of `<SignIn/>`), dodge spam bots and beat the
clock. Anyone can play; signing in with Clerk puts your run on the public leaderboard.

Decisions below were agreed with Ignacio on 2026-11-16. One polished track beats three mediocre
ones, so everything here is scoped to a single circuit.

## Core loop

1. Press play. A 3-2-1 countdown holds the van on the start line in front of Clerk HQ.
2. Drive one lap (~90 s for a clean run). Items on the asphalt and in the shortcuts add points;
   leaving the asphalt slows you down; spam bots steal cookies on contact.
3. Cross the finish line. Score = items collected x multiplier + time bonus.
4. See your score and rank. Signed-in players submit it to the leaderboard; guests are offered
   sign-in to save it.
5. Retry. The run is short so retrying is the game.

## Scoring

| Item | Points | Where |
| --- | --- | --- |
| Cookie (from the "FREE COOKIES" livery) | 10 | Abundant, in lines along the asphalt |
| API key | 50 | Rare, on the outside of corners and in the tunnel |
| Passkey | 100 | Only inside risky shortcuts |
| `<`, `SignIn`, `/>` pieces | x1.5 multiplier when all three are collected | One per track third |
| Session boost | +50 % speed for 3 s | Before the main straight and after the hairpin |
| Spam bot (enemy) | Steals up to 3 cookies on contact and shoves the van | Patrols the forest section |

Time bonus: `max(0, 120 s - lap time) x 5` points. A perfect lap is worth roughly 1500 to
2000 points, so no single pickup dominates.

## Track

Closed loop of about 900 m, clockwise, inside the flat corridor of the existing terrain:

1. **Start / finish** in front of Clerk HQ (Kenney city-commercial pieces) under a racing-kit
   checkered arch, with grandstands and pit tents.
2. **Speed straight** with a session boost and two lines of cookies.
3. **Hairpin** with a gravel **shortcut** that cuts the corner: a passkey sits in it, and it is
   unpaved so the van slows unless it enters with speed.
4. **Tunnel** through a rock outcrop (dark, headlights on, API keys inside).
5. **Forest section** with dense trees, spam bots patrolling, and the second `<SignIn/>` piece.
6. **Bridge** over a stream, then the final sweeping bend back to the finish.

Collectible positions are fixed and listed in `src/game/items.ts`, which the server also reads
to validate runs.

## Controls

- Keyboard: WASD or arrows, space to brake/handbrake, R to restart, M to mute.
- Touch: left/right steering buttons on the left, accelerate/brake on the right. Reduced
  rendering quality (no shadows, fewer grass blades) on phones.
- Camera: chase camera behind and above, FOV widens with speed.

## Van handling

Arcade bicycle model inherited from buildwithclerk: 9 m/s^2 acceleration, 16 m/s top speed
(boost: 24 m/s), 32 degrees steering, 3.75 m wheelbase. Off-asphalt: top speed clamps to 9 m/s.
Hitting a wall or a bot cuts speed to 20 %.

## Leaderboard and auth

- `runs` table in Postgres: id, user_id, username, image_url, score, time_ms, collected (json),
  seed, created_at.
- `POST /api/runs` requires a Clerk session (server-side `auth()`), validates the payload against
  the item list (max count per type, plausible time, score recomputed server-side) and stores one
  row; the leaderboard shows each player's best.
- `/leaderboard`: public top 100 plus the signed-in player's rank.
- Sign in / sign up: Clerk Core 3 custom UI (email code, passkeys, Google and GitHub), app
  created with the Clerk CLI.

## Art and audio

- Van: `clerk_van.glb` (CC BY 4.0 base model by circlegent, Clerk livery by Jibaru).
- World: Poly Haven alps HDRI, PBR terrain splat, ez-tree forest, Poly Haven photoscans,
  Kenney kits (racing, city commercial, nature). All CC0.
- Collectibles: game-icons.net SVGs (CC BY 3.0) extruded in Three.js, emissive Clerk purple/lime,
  floating and spinning, particle burst on pickup.
- Music: one CC0 loop from OpenGameArt; SFX from Kenney (impact, interface, jingles) plus a
  synthesized engine. Every file is listed in `public/CREDITS.md`.

## Cut list (not in v1)

Multiple laps, ghost replays, multiplayer, more tracks, gamepad support, achievements.
