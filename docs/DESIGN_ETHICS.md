# Anti-manipulative-design review

**Reviewed: 2026-07-28.** A point-in-time audit of the app's engagement
mechanics against one question: does anything here rely on guilt, fake
urgency, or an unpredictable reward schedule to keep someone opening the app?
This is a Quran recitation app, not a game or a social feed — the honest
answer this pass was **no changes needed**. Below is exactly what was checked
and why each area passed, so the reasoning is preserved rather than just the
verdict.

## Streak feature

`src/lib/streaks.js` (`computeCurrentStreak`) and `src/lib/achievements.js`
(`reachedStreakMilestone`) only ever count forward. There is no code path that
detects or announces a *broken* streak — a missed day quietly resets the count
next time, with nothing telling the user they "lost" it.
`src/components/quran/WeeklyHeatmap.jsx` renders empty days as neutral slate
bars, not red/warning-colored. Milestones
(`MILESTONE_STREAKS = [3, 7, 14, 30, 60, 100, 180, 365]`) are spaced to "stay
meaningful rather than firing every day" (see that file's own comment), not a
dense reward schedule.

## Celebration moments

`src/components/quran/CelebrationOverlay.jsx` states the intent directly in
its own header comment: *"Deliberately calm (this is a Quran app, not a
game): no bursts, no sound, muted golds and greens."* It auto-dismisses in
2.6s, respects `prefers-reduced-motion`, is non-blocking
(`pointer-events-none`), and its copy ("Keep it going, mashaAllah," "New
personal best!") doesn't compare the user to anyone else — no leaderboards.

## Reminders / notifications

There is no reminder or push-notification system anywhere in the codebase —
no `Notification`/`pushManager`/`requestPermission` usage, and no guilt-style
copy ("haven't practiced," "missed," "come back") anywhere in the UI strings.
Nothing to soften, because nothing exists to soften.

## Infinite-scroll / autoplay

None found. `src/components/quran/AudioPlayer.jsx` auto-advances to the next
ayah when one finishes, but only within a Surah the user explicitly pressed
play on, and it stops at the Surah's end — that's "continue the album I
started," not an algorithmic infinite feed.

## Countdown timer (App Store release, `src/components/CountdownTimer.jsx`)

Re-checked against this same lens after being built in an earlier phase.
Copy is flat and informative ("Coming to the App Store" / "We're live on the
App Store") — no exclamation points, no "hurry," no scarcity language. Holds
up on this independent second pass.

## Subscription paywall (adjacent, not explicitly in scope)

`src/components/quran/UpgradeModal.jsx` discloses "Renews automatically until
cancelled" directly on the plan-selection screen rather than burying it. No
fake urgency/scarcity/discount language ("limited time," "only X left,"
"% off") found anywhere in the app.

## To re-check after future changes

Re-run this review whenever adding: a notification/reminder system, a streak
or achievement mechanic, a paywall or pricing screen, or anything with a
countdown/deadline. The bar is the same each time — no guilt, no fake
urgency, no unpredictable reward timing, no infinite/autoplay content a user
didn't ask for.
