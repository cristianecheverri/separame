import { pushSubscriptionSchema, removePushSubscriptionSchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { ApiError, created, createApiHandler, ok, parseBody } from '../../lib/http';
import { requireProId } from '../../services/profiles';
import { pushConfig, pushToPro, subscribe, unsubscribe, vapidKeys } from '../../services/push';

/**
 * Web push for the professional's devices (PWA). `GET /me/push-config` reads
 * the VAPID public key at runtime: a stage without keys just has push off.
 */
export const handler = createApiHandler({
  'GET /me/push-config': async (event) => {
    const proId = await requireProId(requirePro(event));
    return ok(await pushConfig(proId));
  },

  'POST /me/push-subscriptions': async (event) => {
    const input = parseBody(event, pushSubscriptionSchema);
    const proId = await requireProId(requirePro(event));
    await subscribe(proId, input);
    return created(await pushConfig(proId));
  },

  'POST /me/push-subscriptions/remove': async (event) => {
    const { endpoint } = parseBody(event, removePushSubscriptionSchema);
    const proId = await requireProId(requirePro(event));
    await unsubscribe(proId, endpoint);
    return ok(await pushConfig(proId));
  },

  'POST /me/push-subscriptions/test': async (event) => {
    const proId = await requireProId(requirePro(event));
    if (!(await vapidKeys())) throw new ApiError('conflict', 'Las notificaciones todavía no están disponibles.');
    const sent = await pushToPro(proId, {
      title: 'Sepárame',
      body: 'Las notificaciones de Sepárame están activas',
      url: '/app/',
      tag: 'test',
    });
    return ok({ sent });
  },
});
