import type {
  AdminTeamRequestRow, AdminTeamRow, AdminTeamsResponse, CreateTeamRequestBody, TeamMemberView, TeamResponse, TeamView,
  UpdateTeamBody, UpsertTeamMemberBody,
} from '../../shared/api';
import { ACTING_PRO_HEADER } from '../../shared/api';
import { GSI1 } from '../../shared/infra';
import { slugify, slugProblem } from '../../shared/slug';
import type { ISOInstant, ProProfile, TeamRequest } from '../../shared/types';
import type { AuthUser } from '../lib/auth';
import { requirePro } from '../lib/auth';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { batchGetAll, ddb, failedConditionIndex, getItem, queryAll, stripKeys, table, transactWrite, type Item, type TransactItem } from '../lib/dynamo';
import { ApiError, validationError, type ApiEvent } from '../lib/http';
import { newId } from '../lib/ids';
import {
  profileKey, settingsKey, slugKey, subKey, TEAM_REQUESTS_GSI1PK, teamGsi1Sk, teamKey, teamRequestHistoryKey, teamRequestKey, TEAMS_GSI1PK,
} from '../lib/keys';
import { log } from '../lib/logger';
import { sendTeamApproved, sendTeamRejected, sendTeamRequestToAdmin } from '../mail/notifications';
import { getSettings } from './availability';
import { requirePrice } from './prices';
import { publicUrl, requireProfile, requireProId, toProfile } from './profiles';
import { loadSubscription, requireWritable, subscriptionStatus, type SubItem } from './subscriptions';

/**
 * Team plan (docs/team-plan.md): the owner's request, the admin's review, the
 * team (consultorio page + seats) and its members — regular professionals with
 * no Cognito user and no subscription, managed and paid for by the owner.
 */

export interface TeamItem {
  ownerId: string;
  name: string;
  slug: string;
  seats: number;
  memberIds: string[];
  memberSlugs: string[];
  /** The consultorio's logo (site path under /media/). */
  logo?: string;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
}

type TeamRequestItem = TeamRequest & { ownerId: string; reviewedBy?: string };

const toTeamRequest = (item: Item): TeamRequest => {
  const { status, name, professionals, message, seatsApproved, rejectReason, createdAt, reviewedAt } = stripKeys<TeamRequest>(item);
  return { status, name, professionals, message: message ?? '', seatsApproved: seatsApproved ?? null, rejectReason: rejectReason ?? null, createdAt, reviewedAt: reviewedAt ?? null };
};

export async function getTeamItem(ownerId: string, consistent = false): Promise<TeamItem | undefined> {
  const item = await getItem(teamKey(ownerId), consistent);
  return item ? stripKeys<TeamItem>(item) : undefined;
}

export async function getTeamRequest(ownerId: string, consistent = false): Promise<TeamRequest | null> {
  const item = await getItem(teamRequestKey(ownerId), consistent);
  return item ? toTeamRequest(item) : null;
}

/** Additional professionals the owner pays for (0 without a team). */
export async function teamSeats(ownerId: string): Promise<number> {
  return (await getTeamItem(ownerId, true))?.seats ?? 0;
}

/** Public team page: its owner, or undefined (unknown slug, or a professional's slug). */
export async function teamOwnerBySlug(slug: string): Promise<string | undefined> {
  if (slugProblem(slug)) return undefined;
  const item = await getItem<{ teamOwnerId?: string }>(slugKey(slug));
  return item?.teamOwnerId;
}

// ── Acting professional ─────────────────────────────────────────────────────

/**
 * The professional a /me route acts on: the signed-in owner, or one of their
 * team members named in the `x-separame-pro` header (anything else is 403).
 */
export async function actingProId(event: ApiEvent): Promise<string> {
  const ownerId = await requireProId(requirePro(event));
  const wanted = event.headers?.[ACTING_PRO_HEADER];
  if (!wanted || wanted === ownerId) return ownerId;
  const team = await getTeamItem(ownerId, true);
  if (!team?.memberIds.includes(wanted)) throw new ApiError('forbidden', 'Ese profesional no está en tu equipo.');
  return wanted;
}

// ── Views ────────────────────────────────────────────────────────────────────

const memberOf = (p: ProProfile, isOwner: boolean): TeamMemberView => ({
  proId: p.id, name: p.name, title: p.title, slug: p.slug, isOwner, publicUrl: publicUrl(p.slug), ...(p.logo ? { logo: p.logo } : {}),
});

export async function teamView(team: TeamItem): Promise<TeamView> {
  const ids = [team.ownerId, ...team.memberIds];
  const profiles = new Map((await batchGetAll(ids.map(profileKey), true)).map((item) => [item.id as string, toProfile(item)]));
  const members = ids.flatMap((id, i) => {
    const p = profiles.get(id);
    return p ? [memberOf(p, i === 0)] : [];
  });
  return {
    name: team.name, slug: team.slug, seats: team.seats, createdAt: team.createdAt, publicUrl: publicUrl(team.slug), members,
    ...(team.logo ? { logo: team.logo } : {}),
  };
}

export async function getTeamResponse(ownerId: string): Promise<TeamResponse> {
  const [team, request] = await Promise.all([getTeamItem(ownerId, true), getTeamRequest(ownerId, true)]);
  return { team: team ? await teamView(team) : null, request };
}

// ── Request (owner) ──────────────────────────────────────────────────────────

export async function createTeamRequest(ownerId: string, body: CreateTeamRequestBody, now: Date = new Date()): Promise<TeamResponse> {
  const [profile, previous] = await Promise.all([requireProfile(ownerId, true), getItem(teamRequestKey(ownerId), true)]);
  if (previous?.status === 'pending') throw new ApiError('conflict', 'Ya tienes una solicitud en revisión. Te avisamos por correo.');
  const at = now.toISOString();
  const request: TeamRequest = {
    status: 'pending', name: body.name, professionals: body.professionals, message: body.message ?? '',
    seatsApproved: null, rejectReason: null, createdAt: at, reviewedAt: null,
  };
  // The reviewed request it replaces stays as an immutable history item (who approved what, when).
  const archive: TransactItem[] = previous ? [{
    Put: {
      TableName: table(),
      Item: { ...previous, ...teamRequestHistoryKey(ownerId, previous.createdAt as ISOInstant) },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  }] : [];
  await transactWrite([{
    Put: {
      TableName: table(),
      Item: { ...teamRequestKey(ownerId), ownerId, ...request, [GSI1.pk]: TEAM_REQUESTS_GSI1PK, [GSI1.sk]: teamGsi1Sk(at, ownerId) },
      // Two quick taps must not create two pending requests.
      ConditionExpression: 'attribute_not_exists(PK) OR #s <> :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending' },
    },
  }, ...archive]).catch((err: unknown) => {
    if (failedConditionIndex(err) >= 0) throw new ApiError('conflict', 'Ya tienes una solicitud en revisión. Te avisamos por correo.');
    throw err;
  });
  await sendTeamRequestToAdmin({ profile, request }).catch((err: unknown) => log.error('team request alert failed', { ownerId, err }));
  return getTeamResponse(ownerId);
}

// ── Team and members (owner) ─────────────────────────────────────────────────

async function requireTeam(ownerId: string): Promise<TeamItem> {
  const team = await getTeamItem(ownerId, true);
  if (!team) throw new ApiError('not_found', 'Tu cuenta todavía no tiene plan para equipos.');
  return team;
}

function slugTakenOr(err: unknown, slugIndex: number): never {
  const index = failedConditionIndex(err);
  if (index === slugIndex) throw new ApiError('slug_taken');
  if (index >= 0) throw new ApiError('conflict');
  throw err;
}

/** Slug swap: claim the new one, release the old one (only if it is still ours). */
function slugSwap(next: string, previous: string, owner: Record<string, string>, at: ISOInstant): TransactItem[] {
  const [attr, value] = Object.entries(owner)[0];
  return [
    { Put: { TableName: table(), Item: { ...slugKey(next), ...owner, createdAt: at }, ConditionExpression: 'attribute_not_exists(PK)' } },
    {
      Delete: {
        TableName: table(), Key: slugKey(previous),
        ConditionExpression: 'attribute_not_exists(PK) OR #o = :o', ExpressionAttributeNames: { '#o': attr }, ExpressionAttributeValues: { ':o': value },
      },
    },
  ];
}

export async function updateTeam(ownerId: string, body: UpdateTeamBody, now: Date = new Date()): Promise<TeamResponse> {
  await requireWritable(ownerId, now);
  const team = await requireTeam(ownerId);
  const at = now.toISOString();
  const slugChanged = body.slug !== team.slug;
  const items: TransactItem[] = [{
    Update: {
      TableName: table(), Key: teamKey(ownerId),
      UpdateExpression: 'SET #n = :n, slug = :s, updatedAt = :u',
      ConditionExpression: 'slug = :old',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':n': body.name, ':s': body.slug, ':u': at, ':old': team.slug },
    },
  }];
  if (slugChanged) items.push(...slugSwap(body.slug, team.slug, { teamOwnerId: ownerId }, at));
  await transactWrite(items).catch((err: unknown) => slugTakenOr(err, slugChanged ? 1 : -1));
  return getTeamResponse(ownerId);
}

/** A new member copies the owner's place (city, address, phone) and schedule; services start empty. */
export async function addTeamMember(ownerId: string, body: UpsertTeamMemberBody, now: Date = new Date()): Promise<TeamResponse> {
  await requireWritable(ownerId, now);
  const [team, owner, settings] = await Promise.all([requireTeam(ownerId), requireProfile(ownerId, true), getSettings(ownerId, true)]);
  if (team.memberIds.length >= team.seats) throw new ApiError('conflict', 'Usaste todos tus cupos. Solicita más desde «Equipo».');
  const memberId = newId(now);
  const at = now.toISOString();
  const profile: ProProfile & { ownerId: string } = {
    id: memberId, slug: body.slug, name: body.name, title: body.title, city: owner.city, neighborhood: owner.neighborhood,
    address: owner.address, phone: owner.phone, email: owner.email, createdAt: at, updatedAt: at, ownerId,
  };
  const T = table();
  await transactWrite([
    {
      Update: {
        TableName: T, Key: teamKey(ownerId),
        UpdateExpression: 'SET memberIds = list_append(memberIds, :id), memberSlugs = list_append(memberSlugs, :slug), updatedAt = :u',
        ConditionExpression: 'size(memberIds) < seats',
        ExpressionAttributeValues: { ':id': [memberId], ':slug': [body.slug], ':u': at },
      },
    },
    { Put: { TableName: T, Item: { ...slugKey(body.slug), proId: memberId, createdAt: at }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Put: { TableName: T, Item: { ...profileKey(memberId), ...profile }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Put: { TableName: T, Item: { ...settingsKey(memberId), proId: memberId, schedule: settings.schedule, rules: settings.rules, updatedAt: at } } },
  ]).catch((err: unknown) => {
    if (failedConditionIndex(err) === 0) throw new ApiError('conflict', 'Usaste todos tus cupos. Solicita más desde «Equipo».');
    slugTakenOr(err, 1);
  });
  return getTeamResponse(ownerId);
}

export async function updateTeamMember(ownerId: string, memberId: string, body: UpsertTeamMemberBody, now: Date = new Date()): Promise<TeamResponse> {
  await requireWritable(ownerId, now);
  const team = await requireTeam(ownerId);
  const index = team.memberIds.indexOf(memberId);
  if (index < 0) throw new ApiError('not_found', 'Ese profesional no está en tu equipo.');
  const current = await requireProfile(memberId, true);
  const at = now.toISOString();
  const slugChanged = body.slug !== current.slug;
  const T = table();
  const items: TransactItem[] = [{
    Update: {
      TableName: T, Key: profileKey(memberId),
      UpdateExpression: 'SET #n = :n, title = :t, slug = :s, updatedAt = :u',
      ConditionExpression: 'ownerId = :owner AND slug = :old',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':n': body.name, ':t': body.title, ':s': body.slug, ':u': at, ':owner': ownerId, ':old': current.slug },
    },
  }];
  if (slugChanged) {
    items.push(
      ...slugSwap(body.slug, current.slug, { proId: memberId }, at),
      {
        Update: {
          TableName: T, Key: teamKey(ownerId),
          UpdateExpression: `SET memberSlugs[${index}] = :s, updatedAt = :u`,
          ConditionExpression: `memberIds[${index}] = :id`,
          ExpressionAttributeValues: { ':s': body.slug, ':u': at, ':id': memberId },
        },
      },
    );
  }
  await transactWrite(items).catch((err: unknown) => slugTakenOr(err, slugChanged ? 1 : -1));
  return getTeamResponse(ownerId);
}

/**
 * Members share the owner's place and contact: after the owner edits their profile, copy city,
 * neighborhood, address, phone and email (notices go there) to every member (their pages republish).
 */
export async function syncMembersWithOwner(owner: ProProfile, now: Date = new Date()): Promise<number> {
  const team = await getTeamItem(owner.id, true);
  if (!team?.memberIds.length) return 0;
  const at = now.toISOString();
  await Promise.all(team.memberIds.map((memberId) => ddb.send(new UpdateCommand({
    TableName: table(), Key: profileKey(memberId),
    UpdateExpression: 'SET city = :c, neighborhood = :nb, address = :a, phone = :p, email = :e, updatedAt = :u',
    ConditionExpression: 'ownerId = :owner',
    ExpressionAttributeValues: {
      ':c': owner.city, ':nb': owner.neighborhood, ':a': owner.address, ':p': owner.phone, ':e': owner.email, ':u': at, ':owner': owner.id,
    },
  }))));
  return team.memberIds.length;
}

// ── Admin ────────────────────────────────────────────────────────────────────

const trimDashes = (slug: string) => slug.replace(/-+$/, '');

async function freeSlugFor(name: string): Promise<string> {
  const base = trimDashes(slugify(name).slice(0, 37)) || 'consultorio';
  for (const candidate of [base, ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`)]) {
    if (!slugProblem(candidate) && !(await getItem(slugKey(candidate), true))) return candidate;
  }
  const fallback = `${trimDashes(base.slice(0, 30))}-${newId().slice(-6).toLowerCase()}`;
  return slugProblem(fallback) ? `consultorio-${newId().slice(-6).toLowerCase()}` : fallback;
}

async function requirePendingRequest(ownerId: string): Promise<TeamRequestItem> {
  const item = await getItem(teamRequestKey(ownerId), true);
  if (!item || item.status !== 'pending') throw new ApiError('not_found', 'Esa solicitud ya no está pendiente.');
  return { ...toTeamRequest(item), ownerId };
}

const reviewUpdate = (ownerId: string, set: string, values: Record<string, unknown>): TransactItem => ({
  Update: {
    TableName: table(), Key: teamRequestKey(ownerId),
    UpdateExpression: `SET #s = :status, reviewedAt = :at, reviewedBy = :by, ${set} REMOVE ${GSI1.pk}, ${GSI1.sk}`,
    ConditionExpression: '#s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':pending': 'pending', ...values },
  },
});

/** Creates the team (or sets the new seat count of an existing one) and emails the owner. */
export async function approveTeamRequest(admin: AuthUser, ownerId: string, seats: number, now: Date = new Date()): Promise<void> {
  const request = await requirePendingRequest(ownerId);
  const [team, profile, { item: sub }] = await Promise.all([getTeamItem(ownerId, true), requireProfile(ownerId, true), loadSubscription(ownerId, now)]);
  if (team && seats < team.memberIds.length) {
    throw validationError({ seats: `Ya tiene ${team.memberIds.length} profesionales adicionales: aprueba al menos esos cupos.` });
  }
  const at = now.toISOString();
  const review = reviewUpdate(ownerId, 'seatsApproved = :seats', { ':status': 'approved', ':at': at, ':by': admin.email || admin.sub, ':seats': seats });
  const items: TransactItem[] = [review];
  let slug = team?.slug;
  if (team) {
    items.push({
      Update: {
        TableName: table(), Key: teamKey(ownerId), UpdateExpression: 'SET seats = :seats, updatedAt = :u',
        // A member added since the read above must still fit.
        ConditionExpression: 'size(memberIds) <= :seats',
        ExpressionAttributeValues: { ':seats': seats, ':u': at },
      },
    });
  } else {
    slug = await freeSlugFor(request.name);
    const created: TeamItem = { ownerId, name: request.name, slug, seats, memberIds: [], memberSlugs: [], createdAt: at, updatedAt: at };
    items.push(
      {
        Put: {
          TableName: table(), Item: { ...teamKey(ownerId), ...created, [GSI1.pk]: TEAMS_GSI1PK, [GSI1.sk]: teamGsi1Sk(at, ownerId) },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      { Put: { TableName: table(), Item: { ...slugKey(slug), teamOwnerId: ownerId, createdAt: at }, ConditionExpression: 'attribute_not_exists(PK)' } },
    );
  }
  await transactWrite(items).catch((err: unknown) => {
    if (failedConditionIndex(err) >= 0) throw new ApiError('conflict', 'La solicitud cambió mientras la revisabas. Recarga e inténtalo de nuevo.');
    throw err;
  });
  const price = await requirePrice(sub.priceVersionId);
  await sendTeamApproved({
    profile, teamName: team?.name ?? request.name, teamUrl: publicUrl(slug!), seats, extraProfessionalCop: price.extraProfessionalCop,
  }).catch((err: unknown) => log.error('team approved email failed', { ownerId, err }));
}

export async function rejectTeamRequest(admin: AuthUser, ownerId: string, reason: string, now: Date = new Date()): Promise<void> {
  const request = await requirePendingRequest(ownerId);
  const profile = await requireProfile(ownerId, true);
  await transactWrite([reviewUpdate(ownerId, 'rejectReason = :reason', { ':status': 'rejected', ':at': now.toISOString(), ':by': admin.email || admin.sub, ':reason': reason })])
    .catch((err: unknown) => {
      if (failedConditionIndex(err) >= 0) throw new ApiError('conflict', 'La solicitud cambió mientras la revisabas. Recarga e inténtalo de nuevo.');
      throw err;
    });
  await sendTeamRejected({ profile, teamName: request.name, reason }).catch((err: unknown) => log.error('team rejected email failed', { ownerId, err }));
}

const byGsi1 = (pk: string) => queryAll<Item>({
  IndexName: GSI1.name,
  KeyConditionExpression: '#pk = :pk',
  ExpressionAttributeNames: { '#pk': GSI1.pk },
  ExpressionAttributeValues: { ':pk': pk },
  ScanIndexForward: false,
}, 2000);

/** Every team, newest first (admin list and sitemap). */
export async function listTeams(): Promise<TeamItem[]> {
  return (await byGsi1(TEAMS_GSI1PK)).map((item) => stripKeys<TeamItem>(item));
}

export async function adminTeams(now: Date = new Date()): Promise<AdminTeamsResponse> {
  const [requestItems, teams] = await Promise.all([byGsi1(TEAM_REQUESTS_GSI1PK), listTeams()]);
  const ownerIds = [...new Set([...requestItems.map((r) => r.ownerId as string), ...teams.map((t) => t.ownerId)])];
  const [subs, profiles] = await Promise.all([
    batchGetAll<SubItem>(ownerIds.map(subKey), true),
    batchGetAll(ownerIds.map(profileKey), true),
  ]);
  const subOf = new Map(subs.map((s) => [s.proId, s]));
  const profileOf = new Map(profiles.map((p) => [p.id as string, toProfile(p)]));
  const priceIds = [...new Set(subs.map((s) => s.priceVersionId))];
  const prices = new Map(await Promise.all(priceIds.map(async (id) => [id, await requirePrice(id)] as const)));

  const requests: AdminTeamRequestRow[] = requestItems.flatMap((item) => {
    const ownerId = item.ownerId as string;
    const sub = subOf.get(ownerId);
    const profile = profileOf.get(ownerId);
    if (!sub || !profile) return [];
    return [{
      ownerId, ownerName: profile.name, ownerTitle: profile.title, request: toTeamRequest(item),
      subscription: subscriptionStatus(sub, now), priceName: prices.get(sub.priceVersionId)?.name ?? sub.priceVersionId,
    }];
  });
  const rows: AdminTeamRow[] = teams.flatMap((team) => {
    const sub = subOf.get(team.ownerId);
    const profile = profileOf.get(team.ownerId);
    if (!sub || !profile) return [];
    const price = prices.get(sub.priceVersionId);
    return [{
      ownerId: team.ownerId, ownerName: profile.name, name: team.name, slug: team.slug, seats: team.seats, used: team.memberIds.length,
      priceName: price?.name ?? sub.priceVersionId, extraProfessionalCop: price?.extraProfessionalCop ?? null,
      accessUntil: subscriptionStatus(sub, now).accessUntil,
    }];
  });
  return { requests, teams: rows };
}
