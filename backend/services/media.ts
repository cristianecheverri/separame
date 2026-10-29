import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { IMAGE_EXTENSIONS, isMediaPath, MAX_LOGO_BYTES, MEDIA_PREFIX, sniffImageType } from '../../shared/media';
import { ddb, isConditionalFailure, table } from '../lib/dynamo';
import { env } from '../lib/env';
import { ApiError, validationError } from '../lib/http';
import { profileKey, teamKey } from '../lib/keys';
import { log } from '../lib/logger';
import { sha256Hex } from '../lib/tokens';

/**
 * Logos on the site bucket: `media/<pros|teams>/<id>/<sha256 16>.<ext>`, served
 * by the CDN with a year-long immutable cache (a new image = a new name, so no
 * invalidation). The PROFILE / TEAM item keeps the path; that change makes
 * stream-publish regenerate the static page with it. Replaced images are
 * deleted best effort.
 */

const s3 = new S3Client({});

export type LogoOwner = { kind: 'pros'; proId: string } | { kind: 'teams'; ownerId: string };

const ownerId = (owner: LogoOwner) => (owner.kind === 'pros' ? owner.proId : owner.ownerId);
const itemKey = (owner: LogoOwner) => (owner.kind === 'pros' ? profileKey(owner.proId) : teamKey(owner.ownerId));

/** Validates the image from its bytes and writes it; returns its site path. */
export async function storeLogo(owner: LogoOwner, base64: string): Promise<string> {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw validationError({ image: 'Elige una imagen' });
  if (bytes.length > MAX_LOGO_BYTES) throw validationError({ image: 'La imagen es muy pesada' });
  const type = sniffImageType(bytes);
  if (!type) throw validationError({ image: 'Sube una imagen PNG, JPG o WebP' });
  const key = `${MEDIA_PREFIX.slice(1)}${owner.kind}/${ownerId(owner)}/${sha256Hex(bytes.toString('base64')).slice(0, 16)}.${IMAGE_EXTENSIONS[type]}`;
  await s3.send(new PutObjectCommand({
    Bucket: env.siteBucket(), Key: key, Body: bytes, ContentType: type, CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `/${key}`;
}

async function deleteMedia(path: string | undefined): Promise<void> {
  if (!path || !isMediaPath(path)) return;
  await s3.send(new DeleteObjectCommand({ Bucket: env.siteBucket(), Key: path.slice(1) }))
    .catch((err: unknown) => log.warn('old logo not deleted', { path, err }));
}

/** Sets (or, with null, removes) the logo on the PROFILE / TEAM item; deletes the replaced image. */
export async function setLogo(owner: LogoOwner, path: string | null, now: Date = new Date()): Promise<void> {
  let previous: string | undefined;
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: itemKey(owner),
      UpdateExpression: path ? 'SET logo = :l, updatedAt = :u' : 'SET updatedAt = :u REMOVE logo',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':u': now.toISOString(), ...(path ? { ':l': path } : {}) },
      ReturnValues: 'UPDATED_OLD',
    }));
    previous = res.Attributes?.logo as string | undefined;
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', owner.kind === 'pros' ? 'No encontramos ese perfil.' : 'Aún no tienes un equipo.');
    throw err;
  }
  if (previous && previous !== path) await deleteMedia(previous);
}
