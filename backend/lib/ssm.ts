import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { env } from './env';

/**
 * Cached SSM Parameter Store reads (SecureString, decrypted with the AWS
 * managed key). Names are relative to `SSM_PREFIX` (`/separame/<stage>`),
 * e.g. `getParam(SSM_PARAMS.linkSigningSecret)`. Values are cached per
 * container for a few minutes so a rotated secret propagates without a deploy.
 */

const ssm = new SSMClient({});
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: string; at: number }>();

export async function getParam(relativeName: string): Promise<string> {
  const name = `${env.ssmPrefix()}${relativeName}`;
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} is empty`);
  cache.set(name, { value, at: Date.now() });
  return value;
}

/** Like `getParam` but returns `undefined` when the parameter doesn't exist (dev fallbacks). */
export async function getOptionalParam(relativeName: string): Promise<string | undefined> {
  try {
    return await getParam(relativeName);
  } catch (err) {
    if ((err as { name?: string }).name === 'ParameterNotFound') return undefined;
    throw err;
  }
}

/** Tests only. */
export function clearParamCache(): void {
  cache.clear();
}
