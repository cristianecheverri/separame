import { createMigrationSchema, createPriceSchema, updatePriceSchema } from '../../../shared/schemas';
import { requireAdmin } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, pathParam } from '../../lib/http';
import { cancelMigration, createMigration, listMigrations } from '../../services/migrations';
import { refreshLandingSafely } from '../../services/landing';
import { createPrice, listPricesWithUsage, updatePrice } from '../../services/prices';

/** Admin: immutable price versions (+ usage) and scheduled price migrations. */
export const handler = createApiHandler({
  'GET /admin/prices': async (event) => {
    requireAdmin(event);
    return ok({ prices: await listPricesWithUsage() });
  },

  'POST /admin/prices': async (event) => {
    requireAdmin(event);
    const input = parseBody(event, createPriceSchema);
    const price = await createPrice(input);
    await refreshLandingSafely(); // the landing shows the default version's prices
    return created({ price });
  },

  'PATCH /admin/prices/{priceId}': async (event) => {
    requireAdmin(event);
    const input = parseBody(event, updatePriceSchema);
    const price = await updatePrice(pathParam(event, 'priceId'), input);
    await refreshLandingSafely();
    return ok({ price });
  },

  'GET /admin/price-migrations': async (event) => {
    requireAdmin(event);
    return ok({ migrations: await listMigrations() });
  },

  'POST /admin/price-migrations': async (event) => {
    const admin = requireAdmin(event);
    const input = parseBody(event, createMigrationSchema);
    return created({ migration: await createMigration(admin, input) });
  },

  'POST /admin/price-migrations/{migrationId}/cancel': async (event) => {
    requireAdmin(event);
    return ok({ migration: await cancelMigration(pathParam(event, 'migrationId')) });
  },
});
