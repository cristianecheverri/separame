import { upcomingHolidays } from '../../../shared/holidays';
import { createBlockSchema, putAvailabilitySchema } from '../../../shared/schemas';
import { todayBogota } from '../../../shared/time';
import { requirePro } from '../../lib/auth';
import { created, createApiHandler, noContent, ok, parseBody, pathParam, type ApiEvent } from '../../lib/http';
import { addBlock, deleteBlock, getAvailabilitySettings, putSettings } from '../../services/availability';
import { requireProId } from '../../services/profiles';
import { requireWritable } from '../../services/subscriptions';

/** Weekly schedule, booking rules and blocked periods. */

const HOLIDAYS_SHOWN = 8;

async function writableProId(event: ApiEvent): Promise<string> {
  const proId = await requireProId(requirePro(event));
  await requireWritable(proId);
  return proId;
}

export const handler = createApiHandler({
  'GET /me/availability': async (event) => {
    const proId = await requireProId(requirePro(event));
    return ok({ settings: await getAvailabilitySettings(proId), upcomingHolidays: upcomingHolidays(todayBogota(), HOLIDAYS_SHOWN) });
  },

  'PUT /me/availability': async (event) => {
    const input = parseBody(event, putAvailabilitySchema);
    const proId = await writableProId(event);
    await putSettings(proId, input);
    return ok({ settings: await getAvailabilitySettings(proId), upcomingHolidays: upcomingHolidays(todayBogota(), HOLIDAYS_SHOWN) });
  },

  'POST /me/blocks': async (event) => {
    const input = parseBody(event, createBlockSchema);
    const proId = await writableProId(event);
    return created({ block: await addBlock(proId, input) });
  },

  'DELETE /me/blocks/{blockId}': async (event) => {
    const proId = await writableProId(event);
    await deleteBlock(proId, pathParam(event, 'blockId'));
    return noContent();
  },
});
