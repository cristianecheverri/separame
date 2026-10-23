import { upsertServiceSchema } from '../../../shared/schemas';
import { created, createApiHandler, noContent, ok, parseBody, pathParam, type ApiEvent } from '../../lib/http';
import { actingProId } from '../../services/teams';
import { createService, deleteService, listServices, updateService } from '../../services/services';
import { requireWritable } from '../../services/subscriptions';

/** The professional's services (CRUD). Writes need a non-expired subscription. */

async function writableProId(event: ApiEvent): Promise<string> {
  const proId = await actingProId(event);
  await requireWritable(proId);
  return proId;
}

export const handler = createApiHandler({
  'GET /me/services': async (event) => {
    const proId = await actingProId(event);
    return ok({ services: await listServices(proId, true) });
  },

  'POST /me/services': async (event) => {
    const input = parseBody(event, upsertServiceSchema);
    const proId = await writableProId(event);
    return created({ service: await createService(proId, input) });
  },

  'PUT /me/services/{serviceId}': async (event) => {
    const input = parseBody(event, upsertServiceSchema);
    const proId = await writableProId(event);
    return ok({ service: await updateService(proId, pathParam(event, 'serviceId'), input) });
  },

  'DELETE /me/services/{serviceId}': async (event) => {
    const proId = await writableProId(event);
    await deleteService(proId, pathParam(event, 'serviceId'));
    return noContent();
  },
});
