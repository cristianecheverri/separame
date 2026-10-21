import { toPublicPrices } from '../../../shared/landing';
import { createApiHandler, ok } from '../../lib/http';
import { defaultPrice } from '../../services/prices';

/**
 * Landing pricing (no auth): the active default price version's packages with
 * their monthly equivalents, the founder flag and the trial length. Prices
 * change rarely, so browsers and shared caches may keep it for 5 minutes.
 */
export const handler = createApiHandler({
  'GET /public/prices': async () => {
    const response = ok(toPublicPrices(await defaultPrice()));
    return { ...response, headers: { ...response.headers, 'cache-control': 'public, max-age=300' } };
  },
});
