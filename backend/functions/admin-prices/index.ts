import { createMigrationSchema, createPriceSchema, updatePriceSchema } from '../../../shared/schemas';
import { requireAdmin } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, pathParam } from '../../lib/http';
import { cancelMigration, createMigration, listMigrations } from '../../services/migrations';
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
    return created({ price: await createPrice(input) });
  },

  'PATCH /admin/prices/{priceId}': async (event) => {
    requireAdmin(event);
    const input = parseBody(event, updatePriceSchema);
    return ok({ price: await updatePrice(pathParam(event, 'priceId'), input) });
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
