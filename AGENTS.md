# AGENTS.md

## Project Context

Standalone React + Vite app. No backend/platform dependency (previously
ran on Base44; that has been fully removed). See `README.md` for setup.

## Key Files

- `src/`: frontend application source.
- `src/lib/localAuth.js`: on-device email/password auth (localStorage only).
- `src/lib/localDb.js`: generic localStorage-backed entity store
  (RecitationLog, DailyStreak, MemorizationProgress).
- `src/lib/audioAnalysis.js`: real DSP-based recitation scoring (energy,
  pitch, DTW alignment) — actually listens to the recording.
- `src/lib/recitationService.js`: wires reference-audio fetching +
  audioAnalysis + local persistence together for the recording UI.
- `vite.config.js`: plain Vite + React config.

## Working Notes

- `npm run dev` starts the frontend; there is no separate backend process.
- Run `npm run lint` and `npm run build` before finishing code changes.
