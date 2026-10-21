import { updateCalendarSyncSchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { createApiHandler, ok, parseBody, pathParam } from '../../lib/http';
import { log } from '../../lib/logger';
import {
  buildFeed, getOrCreateSync, resolveFeed, rotateFeedToken, setInvitesEnabled, syncResponse,
} from '../../services/calendar-sync';
import { requireProfile, requireProId } from '../../services/profiles';

/**
 * Calendar sync: the pro's secret .ics subscription feed (public, polled by
 * Google / Outlook / Apple) and its settings. The feed contains clients'
 * personal data: only the proId is logged, never the token. It keeps working
 * when the plan expired (existing appointments still happen). Settings are
 * allowed in read-only mode too.
 */
export const handler = createApiHandler({
  'GET /public/calendar/{file}': async (event) => {
    const proId = await resolveFeed(pathParam(event, 'file'));
    const pro = await requireProfile(proId);
    const body = await buildFeed(pro);
    log.info('calendar feed served', { proId });
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="separame.ics"',
        'cache-control': 'private, max-age=300',
      },
      body,
    };
  },

  'GET /me/calendar-sync': async (event) => {
    const proId = await requireProId(requirePro(event));
    return ok(syncResponse(await getOrCreateSync(proId)));
  },

  'PUT /me/calendar-sync': async (event) => {
    const { invitesEnabled } = parseBody(event, updateCalendarSyncSchema);
    const proId = await requireProId(requirePro(event));
    return ok(syncResponse(await setInvitesEnabled(proId, invitesEnabled)));
  },

  'POST /me/calendar-sync/rotate': async (event) => {
    const proId = await requireProId(requirePro(event));
    return ok(syncResponse(await rotateFeedToken(proId)));
  },
});
