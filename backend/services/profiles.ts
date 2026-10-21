import type {
  MeResponse, OnboardingRequest, ProfileResponse, PublicProfile, SlugCheckResponse, UpdateProfileRequest,
} from '../../shared/api';
import { DEFAULT_RULES, DEFAULT_SCHEDULE } from '../../shared/availability';
import { initials } from '../../shared/format';
import { slugify, slugProblem } from '../../shared/slug';
import { TRIAL_DAYS } from '../../shared/subscription';
import type { ProProfile, Service } from '../../shared/types';
import type { AuthUser } from '../lib/auth';
import { failedConditionIndex, getItem, stripKeys, table, transactWrite, type Item, type TransactItem } from '../lib/dynamo';
import { env } from '../lib/env';
import { ApiError } from '../lib/http';
import { newId } from '../lib/ids';
import { log } from '../lib/logger';
import { ownerKey, profileKey, settingsKey, slugKey, subKey, trialKey } from '../lib/keys';
import { sha256Hex } from '../lib/tokens';
import { defaultPrice } from './prices';
import { toPublicService } from './services';
import { loadSubItem, requireWritable, subIndexAttrs, subscriptionStatus, type SubItem } from './subscriptions';

/**
 * Professional accounts: Cognito user → professional (`OWNER#<sub>`), the
 * public profile, unique slugs (`SLUG#<slug>`, conditional puts) and the
 * one-free-trial-per-email marker (`TRIAL#<sha256(email)>`).
 */

const DAY_MS = 86_400_000;

export function toProfile(item: Item): ProProfile {
  const { id, slug, name, title, city, neighborhood, address, phone, email, createdAt, updatedAt } = stripKeys<ProProfile>(item);
  return { id, slug, name, title, city, neighborhood: neighborhood ?? '', address: address ?? '', phone: phone ?? null, email, createdAt, updatedAt };
}

export const publicUrl = (slug: string): string => `${env.siteUrl()}/${slug}`;

export const trialHash = (email: string): string => sha256Hex(email.trim().toLowerCase());

export function toPublicProfile(profile: ProProfile, services: Service[]): PublicProfile {
  return {
    slug: profile.slug,
    name: profile.name,
    title: profile.title,
    city: profile.city,
    neighborhood: profile.neighborhood,
    address: profile.address,
    phone: profile.phone,
    initials: initials(profile.name),
    services: services.filter((s) => s.visible).map(toPublicService),
  };
}

export async function proIdForUser(cognitoSub: string): Promise<string | undefined> {
  const owner = await getItem<{ proId: string }>(ownerKey(cognitoSub), true);
  return owner?.proId;
}

/** Professional routes: the caller's proId, or 409 `needs_onboarding`. */
export async function requireProId(user: AuthUser): Promise<string> {
  const proId = await proIdForUser(user.sub);
  if (!proId) throw new ApiError('needs_onboarding');
  return proId;
}

export async function getProfile(proId: string, consistent = false): Promise<ProProfile | undefined> {
  const item = await getItem(profileKey(proId), consistent);
  return item ? toProfile(item) : undefined;
}

export async function requireProfile(proId: string, consistent = false): Promise<ProProfile> {
  const profile = await getProfile(proId, consistent);
  if (!profile) throw new ApiError('not_found', 'No encontramos ese perfil.');
  return profile;
}

export async function proIdBySlug(slug: string): Promise<string | undefined> {
  if (slugProblem(slug)) return undefined;
  const item = await getItem<{ proId: string }>(slugKey(slug));
  return item?.proId;
}

export async function getMe(user: AuthUser, now: Date = new Date()): Promise<MeResponse> {
  const proId = await proIdForUser(user.sub);
  const base = { email: user.email, isAdmin: user.isAdmin };
  if (!proId) return { ...base, profile: null, subscription: null, publicUrl: null };
  const [profile, sub] = await Promise.all([getProfile(proId, true), loadSubItem(proId, true)]);
  if (!profile || !sub) return { ...base, profile: null, subscription: null, publicUrl: null };
  return { ...base, profile, subscription: subscriptionStatus(sub, now), publicUrl: publicUrl(profile.slug) };
}

/** Maps a failed onboarding / profile transaction to the right API error. */
function slugOrConflict(err: unknown, slugIndex: number, ownerIndex = -1): never {
  const index = failedConditionIndex(err);
  if (index === slugIndex) throw new ApiError('slug_taken');
  if (index === ownerIndex) throw new ApiError('conflict', 'Ya tienes un perfil creado.');
  if (index >= 0) throw new ApiError('conflict');
  throw err;
}

/**
 * Creates the professional in ONE transaction: owner link, slug, profile,
 * subscription (trial), default settings and the trial marker. An email that
 * already used its trial gets an already-ended trial (it must pay to book).
 */
export async function onboard(user: AuthUser, input: OnboardingRequest, now: Date = new Date()): Promise<ProfileResponse> {
  if (!user.email) throw new ApiError('unauthorized', 'Tu sesión no trae un correo verificado. Vuelve a entrar.');
  if (await proIdForUser(user.sub)) throw new ApiError('conflict', 'Ya tienes un perfil creado.');

  const hash = trialHash(user.email);
  const [trialUsed, price] = await Promise.all([getItem(trialKey(hash), true), defaultPrice(now)]);
  const proId = newId(now);
  const at = now.toISOString();
  const trialEndsAt = trialUsed ? at : new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString();

  const profile: ProProfile = {
    id: proId, slug: input.slug, name: input.name, title: input.title, city: input.city,
    neighborhood: input.neighborhood ?? '', address: input.address ?? '', phone: input.phone ?? null, email: user.email, createdAt: at, updatedAt: at,
  };
  const sub: SubItem = {
    proId, trialEndsAt, trialStartedAt: at, paidUntil: null, priceVersionId: price.id,
    name: profile.name, slug: profile.slug, title: profile.title, email: profile.email, createdAt: at, updatedAt: at,
  };
  const T = table();
  const items: TransactItem[] = [
    { Put: { TableName: T, Item: { ...ownerKey(user.sub), proId, createdAt: at }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Put: { TableName: T, Item: { ...slugKey(profile.slug), proId, createdAt: at }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Put: { TableName: T, Item: { ...profileKey(proId), ...profile, cognitoSub: user.sub }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Put: { TableName: T, Item: { ...subKey(proId), ...sub, ...subIndexAttrs(sub) } } },
    { Put: { TableName: T, Item: { ...settingsKey(proId), proId, schedule: DEFAULT_SCHEDULE, rules: DEFAULT_RULES, updatedAt: at } } },
  ];
  if (!trialUsed) {
    items.push({ Put: { TableName: T, Item: { ...trialKey(hash), proId, at }, ConditionExpression: 'attribute_not_exists(PK)' } });
  }
  try {
    await transactWrite(items);
  } catch (err) {
    slugOrConflict(err, 1, 0);
  }
  log.info('pro onboarded', { proId, trialGranted: !trialUsed });
  return { profile, subscription: subscriptionStatus(sub, now), publicUrl: publicUrl(profile.slug) };
}

export interface UpdateProfileResult extends ProfileResponse {
  /** Set when the slug changed: the old static page must go. */
  previousSlug: string | null;
}

/** Profile edit, including a slug change (old/new SLUG items swapped in the same transaction). */
export async function updateProfile(user: AuthUser, input: UpdateProfileRequest, now: Date = new Date()): Promise<UpdateProfileResult> {
  const proId = await requireProId(user);
  const { item: subItem } = await requireWritable(proId, now);
  const current = await requireProfile(proId, true);
  const at = now.toISOString();
  const email = user.email || current.email;
  const slugChanged = input.slug !== current.slug;
  const T = table();

  const items: TransactItem[] = [
    {
      Update: {
        TableName: T,
        Key: profileKey(proId),
        UpdateExpression: 'SET slug = :slug, #n = :n, title = :t, city = :c, neighborhood = :nb, address = :a, phone = :p, email = :e, updatedAt = :u',
        ConditionExpression: 'attribute_exists(PK) AND slug = :old',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':slug': input.slug, ':n': input.name, ':t': input.title, ':c': input.city, ':nb': input.neighborhood ?? '', ':a': input.address ?? '',
          ':p': input.phone ?? null, ':e': email, ':u': at, ':old': current.slug,
        },
      },
    },
    {
      Update: {
        TableName: T,
        Key: subKey(proId),
        UpdateExpression: 'SET slug = :slug, #n = :n, title = :t, email = :e, updatedAt = :u',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':slug': input.slug, ':n': input.name, ':t': input.title, ':e': email, ':u': at },
      },
    },
  ];
  if (slugChanged) {
    items.push(
      { Put: { TableName: T, Item: { ...slugKey(input.slug), proId, createdAt: at }, ConditionExpression: 'attribute_not_exists(PK)' } },
      {
        Delete: {
          TableName: T, Key: slugKey(current.slug),
          ConditionExpression: 'attribute_not_exists(PK) OR proId = :me', ExpressionAttributeValues: { ':me': proId },
        },
      },
    );
  }
  try {
    await transactWrite(items);
  } catch (err) {
    slugOrConflict(err, slugChanged ? 2 : -1);
  }
  const profile: ProProfile = {
    ...current, slug: input.slug, name: input.name, title: input.title, city: input.city,
    neighborhood: input.neighborhood ?? '', address: input.address ?? '', phone: input.phone ?? null, email, updatedAt: at,
  };
  return {
    profile,
    subscription: subscriptionStatus(subItem, now),
    publicUrl: publicUrl(profile.slug),
    previousSlug: slugChanged ? current.slug : null,
  };
}

async function slugFree(slug: string, proId?: string): Promise<boolean> {
  const item = await getItem<{ proId: string }>(slugKey(slug), true);
  return !item || (!!proId && item.proId === proId);
}

export async function slugCheck(user: AuthUser, rawSlug: string): Promise<SlugCheckResponse> {
  const slug = rawSlug.trim().toLowerCase();
  const proId = await proIdForUser(user.sub);
  const problem = slugProblem(slug);
  if (problem) {
    const alt = slugify(slug);
    const suggestion = alt && alt !== slug && !slugProblem(alt) && (await slugFree(alt, proId)) ? alt : null;
    return { slug, available: false, problem, suggestion };
  }
  if (await slugFree(slug, proId)) return { slug, available: true, problem: null, suggestion: null };
  for (let n = 2; n <= 9; n++) {
    const candidate = `${slug.slice(0, 37)}-${n}`;
    if (!slugProblem(candidate) && (await slugFree(candidate, proId))) {
      return { slug, available: false, problem: 'taken', suggestion: candidate };
    }
  }
  return { slug, available: false, problem: 'taken', suggestion: null };
}
