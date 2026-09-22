#!/bin/bash
# ============================================================================
# KHS IAT deployment — read this top to bottom, don't just run it blind.
#
# This is written as a reference/runbook, not a one-shot script. Each section
# below is meant to be copy-pasted into the DigitalOcean Web Console one
# block at a time, checking the output before moving to the next block —
# exactly how the 2026-09-22 deploy was actually done. Piping the whole file
# into bash unattended skips every "does this look right before I continue"
# check that this process exists for.
#
# Where this runs: DigitalOcean → Droplets → "Microservices" (170.64.133.33)
# → Web Console button (browser terminal, uses your DO login, no SSH key
# needed). This droplet hosts other things too (a C2C GenAI agent, at least) —
# be careful, this isn't a dedicated KHS box.
#
# What's on it, as systemd services (systemctl cat <name> to see any of these):
#   khs-iat-be   /root/khs/iat/Kinky-Hair-Stylist-BE-Redesign                          port 10200
#   khs-iat-fe   /root/khs/iat/Kinky-Hair-Stylist-FE-Redesign/kinky-hair-stylist       port 10100
#   khs-sit-be   SIT environment — not covered here, paths/branch unconfirmed as of 2026-09-22
#   khs-sit-fe   SIT environment — same
# Both khs-iat-* services track the `main` branch of their repo. Note the
# GitHub repo names differ from the local clone names you're used to:
#   khs-iat-backend  ==  Kinky-Hair-Stylist-BE-Redesign   (GitHub redirect, same repo)
#   khs-iat-frontend ==  Kinky-Hair-Stylist-FE-Redesign    (GitHub redirect, same repo)
#
# No CI/CD deploys any of this automatically. This script IS the deploy
# process. There's also no branch protection on any branch in either repo —
# nothing stops a bad push, so the manual verification steps below matter.
# ============================================================================


# ----------------------------------------------------------------------------
# TERMINAL GOTCHAS — read before you start, saves a lot of confusion
# ----------------------------------------------------------------------------
#
# 1. Paste corruption: the first paste after certain interrupts sometimes
#    shows up prefixed with garbage like `^[[200~` and errors with
#    "command not found". Harmless — press Enter to clear the broken line
#    and paste the same command again, it usually goes through clean.
#
# 2. `journalctl -u <service> -f` BLOCKS the terminal — no more commands will
#    run (or even appear to do anything) until you press Ctrl+C. If a later
#    command in your session seems to "do nothing," you're probably still
#    inside a -f stream from earlier. Ctrl+C first, always, before assuming
#    something's stuck. If Ctrl+C genuinely doesn't respond: click directly
#    inside the terminal pane first (to make sure it has keyboard focus),
#    then Ctrl+C again. If that still fails, just close and reopen the Web
#    Console tab — it's a fresh session, nothing on the server is affected.
#
# 3. Never print an actual secret value to the screen. Checking whether an
#    env var is SET, or checking its LENGTH, is fine and doesn't need this
#    care — e.g.:
#      grep -oE '^[A-Z_]+=' .env                          # names only
#      val=$(grep '^SOME_KEY=' .env | cut -d'=' -f2-); echo ${#val}   # length only
#    Don't `cat .env` or echo a var's actual value into the terminal.


# ----------------------------------------------------------------------------
# BACKEND DEPLOY — khs-iat-be
# ----------------------------------------------------------------------------

cd /root/khs/iat/Kinky-Hair-Stylist-BE-Redesign

# Stop it first. Don't skip this — deploying into a running process (pulling
# code and rebuilding dist/ while node is still reading old files from it)
# is how you get a half-old-half-new state that's hard to debug.
systemctl stop khs-iat-be

# A previous npm install's transitive dependency resolution sometimes leaves
# package-lock.json with an uncommitted diff (harmless drift, not real work) —
# discard it before pulling so git doesn't refuse the pull over it. If you're
# ever unsure whether it's really harmless, `git diff package-lock.json` first.
git checkout -- package-lock.json 2>/dev/null

git pull origin main

npm install

# Sanity-check @nestjs/core and @nestjs/common landed on the same minor
# version. This isn't paranoia — it broke the 2026-09-22 deploy (fixed
# properly in the repo since, PR #247, but check anyway; a future dependency
# bump could reintroduce drift the same way).
node -p "require('./node_modules/@nestjs/core/package.json').version"
node -p "require('./node_modules/@nestjs/common/package.json').version"
# ^ if those two don't share a minor version (e.g. 11.2.x vs 11.1.x), stop
#   here and fix it before building:
#     npm install @nestjs/common@<whatever @nestjs/core printed>
#   then also flag it — the repo's package.json/package-lock.json shouldn't
#   let this happen again; if it does, that fix needs revisiting.

npm run build

systemctl start khs-iat-be

# Give it a moment, then check it actually started clean — not just that
# `systemctl start` returned with no error (it returns immediately either way).
sleep 3
journalctl -u khs-iat-be -n 40 --no-pager
# Look for "Nest application successfully started" and "Server running on
# http://localhost:10200" with nothing red/erroring after it.

# Functional check — confirms it's not just "up" but actually serving real
# data (a process can report itself started while its DB connection is
# broken, for instance):
curl -s http://localhost:10200/api/salons | head -c 200
# Should return real JSON with a business name in it, not empty/an error page.

# If you have reason to suspect the JWT secret specifically (garbled/missing
# .env edit, etc.) — this confirms JWT verification itself is working
# without needing a real token:
curl -s -w "\nHTTP %{http_code}\n" http://localhost:10200/api/business/business-details \
  -H "Authorization: Bearer garbage"
# Expect: {"message":"Invalid or expired token",...} and HTTP 401.
# If instead you see "secret or public key must be provided" in the journal
# for this request, JWT_ACCESS_SECRET isn't loading — see TROUBLESHOOTING.


# ----------------------------------------------------------------------------
# FRONTEND DEPLOY — khs-iat-fe
# ----------------------------------------------------------------------------

cd /root/khs/iat/Kinky-Hair-Stylist-FE-Redesign/kinky-hair-stylist

systemctl stop khs-iat-fe

git checkout -- package-lock.json 2>/dev/null
git pull origin main

npm install
# No known version-mismatch gotcha on the frontend side (unlike backend's
# nestjs issue) — a plain install has been clean here so far.

npm run build
# This one takes longer — compiling all ~100 routes. Let it finish; don't
# assume it's stuck.

systemctl start khs-iat-fe

sleep 3
journalctl -u khs-iat-fe -n 30 --no-pager
# Look for "Ready in ...ms" with no errors after it. A workspace-root /
# multiple-lockfiles warning is expected and harmless — ignore it.

systemctl is-active khs-iat-fe
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:10100/
# Expect: active / HTTP 200


# ----------------------------------------------------------------------------
# WATCH BOTH FOR A MINUTE UNDER REAL TRAFFIC BEFORE CALLING IT DONE
# ----------------------------------------------------------------------------
# journalctl -u khs-iat-be -f      # Ctrl+C after ~a minute
# journalctl -u khs-iat-fe -f      # Ctrl+C after ~a minute
#
# Better still: actually log in as a merchant on https://iat.kinkyhairstylists.com
# and click around — a garbage-token curl test proves the guard works, but
# it doesn't prove every route does. (This is exactly how the 2026-09-22
# JWT-shadowing bug was actually caught — everything looked healthy by every
# check above, and it was still broken for five specific routes. See
# TROUBLESHOOTING.)


# ----------------------------------------------------------------------------
# ROLLBACK
# ----------------------------------------------------------------------------
# Known-good commits as of 2026-09-22 (before that day's deploy):
#   backend:  e8154c6
#   frontend: a859b80
# For anything more recent, `git log --oneline` on main and pick the commit
# before whatever broke things.
#
#   systemctl stop khs-iat-be                 # (or khs-iat-fe)
#   git reset --hard <known-good-commit>
#   rm -rf node_modules && npm install
#   # npm ci is usually preferred over npm install for a clean rollback, but
#   # it can fail with EUSAGE if package.json/package-lock.json were already
#   # slightly out of sync at that commit (this happened rolling back to
#   # e8154c6 — two packages were missing from the lockfile, pre-existing,
#   # unrelated to anything in this deploy). npm install works around it.
#   npm run build
#   systemctl start khs-iat-be


# ----------------------------------------------------------------------------
# TROUBLESHOOTING — real incidents from the 2026-09-22 deploy
# ----------------------------------------------------------------------------
#
# Both of these are fixed in the repo now (main/DEV-KHS/PRE-DEV-KHS all have
# the fixes). Left here so if either symptom ever reappears — after a
# dependency bump, or a merge that reintroduces the old pattern — whoever's
# looking at it doesn't have to rediscover the cause from scratch.
#
# --- Symptom: service crash-loops right after `npm install` + `npm run build`,
#     journalctl shows:
#       Error: Cannot find module '@nestjs/common/decorators/http/sse-signal.decorator'
#     Cause: @nestjs/core and @nestjs/common resolved to different minor
#     versions. Fixed in package.json/package-lock.json (PR #247) — if this
#     comes back, check `node -p "require('./node_modules/@nestjs/core/package.json').version"`
#     against the same for @nestjs/common, and re-align them
#     (`npm install @nestjs/common@<core's version>`).
#
# --- Symptom: a merchant can log in and land on the dashboard, then gets
#     logged out again within moments, as soon as the dashboard tries to load
#     business data. journalctl shows, for a REAL valid token:
#       [JwtAuthGuard] Token verification failed: JsonWebTokenError secret or
#       public key must be provided | URL: /api/business/getTeamMembers
#     (and business-details, owner-details, getServices, getBookings — but
#     notably NOT other modules' routes, like notifications or clients, which
#     work fine with the exact same token in the same request burst).
#     Cause: src/business/business.module.ts imported JwtModule.register({})
#     locally, with no secret — shadowing the real, globally-configured
#     JwtModule (from app.module.ts) for every guard/service resolved through
#     that specific module. Fixed by removing the redundant local import
#     (PR #244) — JwtModule is already global, nothing needs to re-import it.
#     If a similar "some routes 401 with a token that works everywhere else"
#     bug ever shows up again: `grep -rn "JwtModule" src` and look for any
#     OTHER local registration besides the one in app.module.ts.
#
# --- Both were found by watching `journalctl -u khs-iat-be -f` while
#     reproducing the actual symptom (a real browser login, a real curl
#     request) — not by reading code first. The code reading came after,
#     once the log line pointed at where to look. If something's broken and
#     the cause isn't obvious, reproduce it while watching the log before
#     guessing.
