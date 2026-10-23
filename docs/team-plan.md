# Team plan (phase 2) — technical design

Product decisions: CLAUDE.md «Plan para equipos». Approved mockups: `mockups/proposals/team-*`.

## Core idea

A team member is a **regular professional without a Cognito user and without a subscription**:
`PRO#<memberId>` has its own PROFILE, SETTINGS, SERVICE#, BLOCK#, APPT#, CLIENT#, WAIT# items and its own
`SLUG#<slug>`, so availability, booking, locks, reminders, emails, waitlist and the static `/<slug>` page work
unchanged. What changes is **who pays** (the owner's SUB) and **who manages** (the owner's Cognito user).

```
PRO#<ownerId>  TEAM         { name, slug, seats, memberIds[], memberSlugs[], createdAt, updatedAt }  (seats = approved additional professionals)
                            GSI1PK=TEAMS  GSI1SK=<createdAt>#<ownerId>          (admin list, sitemap)
PRO#<ownerId>  TEAMREQ      { status: pending|approved|rejected, name, professionals, message,
                              seatsApproved?, rejectReason?, createdAt, reviewedAt?, reviewedBy? }
                            GSI1PK=TEAMREQS GSI1SK=<createdAt>#<ownerId>  (only while pending)
PRO#<memberId> PROFILE      ProProfile + ownerId (email = owner's email: notices and Reply-To go to the owner)
SLUG#<teamSlug> SLUG        { teamOwnerId }      (same uniqueness space as professionals' slugs)
```

## Rules

- **Subscription:** `loadSubscription(proId)` resolves a member to its owner's SUB (`ownerOf`). Every gate
  (`requireWritable`, `assertBookable`, public `active`) therefore follows the owner: one expiry for everybody.
- **Acting professional:** pro routes take an optional `X-Separame-Pro: <proId>` header. `actingProId(event)`
  returns the owner's proId, or the member's when the header names a member of the owner's TEAM (else 403).
  Used by appointments, services, availability, clients, stats and waitlist. Billing, notifications, calendar
  sync, profile and referrals always act on the owner.
- **Seats:** the admin approves N additional seats; the owner can create up to N members (conditional on
  `size(memberIds) < seats`). More seats = a new request. Members are never deleted in this version.
- **Price:** `PriceVersion.extraProfessionalCop: number | null` (frozen with the version like the packages).
  A package's team amount = `amountCop + seats × extraProfessionalCop × months`, computed on the server for
  "Ya pagué" notices (`teamPackageAmount` in shared/subscription.ts) and suggested to the admin.
- **Public:** member pages are the normal `/<slug>` pages plus `team: { name, slug }` («Parte de …»). The team page
  `/<teamSlug>` is the same booking template with `{ team: PublicTeam }` embedded: a first step «¿Con quién?».
  «Cualquiera disponible» merges the members' availability for services with the same name client-side and books
  the slot with the member that owns it (existing per-member endpoints: no new public routes).
- **Republishing:** stream-publish also listens to `TEAM`; a member's PROFILE/SERVICE change republishes the
  member page and the team page.
- **Sitemap:** adds team slugs and member slugs of bookable owners (GSI1 `TEAMS`).

## API (new)

| Route | Auth | |
|---|---|---|
| `GET /me/team` | pro | `{ request, team }` (team with members) |
| `POST /me/team-request` | pro | `{ name, professionals, message }` → pending (one at a time) |
| `PUT /me/team` | pro | rename the team / change its slug |
| `POST /me/team/members` | pro | create a member (name, title, slug); copies the owner's address and schedule |
| `PUT /me/team/members/{proId}` | pro | edit a member's name, title, slug |
| `GET /admin/teams` | admin | pending requests + active teams |
| `POST /admin/team-requests/{proId}/approve` | admin | `{ seats }` → TEAM created or its seats updated (seats live only in TEAM), email |
| `POST /admin/team-requests/{proId}/reject` | admin | `{ reason }` → email |
| `POST /public/teams/{slug}/waitlist` | public | «Cualquiera disponible»: one captcha, one entry per member offering the service (only the first sends «Te avisaremos») |

Also: a new request keeps the reviewed one as `TEAMREQ#<createdAt>` (audit); the owner's calendar feed includes the
members' appointments («Julián · Valoración · …»); member notices (push, emails, invitations) go to the owner and say
whose agenda it is; a merged «Cualquiera disponible» service with different prices shows «Desde <lowest>».

`MeResponse.team` carries the summary the panel needs on every screen (members for the selector, seats).
