import { clientsQuerySchema, updateClientNotesSchema } from '../../../shared/schemas';
import { createApiHandler, noContent, ok, parseBody, parseQuery, pathParam } from '../../lib/http';
import { clientDetail, deleteClient, listClients, updateClientNotes } from '../../services/clients';
import { actingProId } from '../../services/teams';

/**
 * Client history per professional. Notes are logistics only (the panel warns
 * not to store health data). Deleting a client scrubs their personal data
 * from past appointments (Ley 1581); refused while they have upcoming ones.
 */
export const handler = createApiHandler({
  'GET /me/clients': async (event) => {
    const { q } = parseQuery(event, clientsQuerySchema);
    const proId = await actingProId(event);
    return ok({ clients: await listClients(proId, q) });
  },

  'GET /me/clients/{clientKey}': async (event) => {
    const proId = await actingProId(event);
    return ok(await clientDetail(proId, pathParam(event, 'clientKey')));
  },

  'PUT /me/clients/{clientKey}/notes': async (event) => {
    const { notes } = parseBody(event, updateClientNotesSchema);
    const proId = await actingProId(event);
    return ok({ client: await updateClientNotes(proId, pathParam(event, 'clientKey'), notes) });
  },

  'DELETE /me/clients/{clientKey}': async (event) => {
    const proId = await actingProId(event);
    await deleteClient(proId, pathParam(event, 'clientKey'));
    return noContent();
  },
});
