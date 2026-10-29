import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_LOGO_BYTES } from '../../shared/media';
import { conditionalFailure, PRO_ID, setTestEnv } from '../testing/fixtures';
import { setLogo, storeLogo } from './media';

setTestEnv();
const s3 = mockClient(S3Client);
const ddb = mockClient(DynamoDBDocumentClient);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64');

beforeEach(() => {
  s3.reset();
  ddb.reset();
  s3.on(PutObjectCommand).resolves({});
  s3.on(DeleteObjectCommand).resolves({});
});

describe('storeLogo', () => {
  it('stores a real image under a content-hash name with a year-long immutable cache', async () => {
    const path = await storeLogo({ kind: 'pros', proId: PRO_ID }, PNG);
    expect(path).toMatch(new RegExp(`^/media/pros/${PRO_ID}/[a-f0-9]{16}\\.png$`));
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put).toMatchObject({ Key: path.slice(1), ContentType: 'image/png', CacheControl: 'public, max-age=31536000, immutable' });
    // Same bytes → same name (a re-upload doesn't pile up copies).
    expect(await storeLogo({ kind: 'pros', proId: PRO_ID }, PNG)).toBe(path);
  });

  it('refuses SVG/HTML (script risk), unknown bytes and images over the limit, before writing', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    await expect(storeLogo({ kind: 'pros', proId: PRO_ID }, svg)).rejects.toMatchObject({ code: 'validation' });
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_LOGO_BYTES)]).toString('base64');
    await expect(storeLogo({ kind: 'pros', proId: PRO_ID }, big)).rejects.toMatchObject({ code: 'validation' });
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});

describe('setLogo', () => {
  it('saves the path on the profile and deletes the image it replaces', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { logo: `/media/pros/${PRO_ID}/0123456789abcdef.webp` } });
    await setLogo({ kind: 'pros', proId: PRO_ID }, `/media/pros/${PRO_ID}/fedcba9876543210.png`);
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({ Key: { PK: `PRO#${PRO_ID}`, SK: 'PROFILE' }, UpdateExpression: 'SET logo = :l, updatedAt = :u' });
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe(`media/pros/${PRO_ID}/0123456789abcdef.webp`);
  });

  it('removing it goes back to the initials; a team logo lives on the TEAM item', async () => {
    ddb.on(UpdateCommand).resolves({});
    await setLogo({ kind: 'teams', ownerId: PRO_ID }, null);
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({ Key: { PK: `PRO#${PRO_ID}`, SK: 'TEAM' }, UpdateExpression: 'SET updatedAt = :u REMOVE logo' });
  });

  it('a team logo without a team is not_found', async () => {
    ddb.on(UpdateCommand).rejects(conditionalFailure());
    await expect(setLogo({ kind: 'teams', ownerId: PRO_ID }, null)).rejects.toMatchObject({ code: 'not_found' });
  });
});
