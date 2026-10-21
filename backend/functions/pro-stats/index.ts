import { statsQuerySchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { createApiHandler, ok, parseQuery } from '../../lib/http';
import { requireProId } from '../../services/profiles';
import { proStats } from '../../services/stats';

/** Statistics for a Bogotá date range (≤ STATS_MAX_DAYS) and the period right before it. */
export const handler = createApiHandler({
  'GET /me/stats': async (event) => {
    const { from, to } = parseQuery(event, statsQuerySchema);
    const proId = await requireProId(requirePro(event));
    return ok(await proStats(proId, from, to));
  },
});
