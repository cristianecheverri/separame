import type { Appointment } from '@shared/types';
import { firstName } from '../../lib/format';
import { useActing } from '../../lib/queries';
import { memberColor } from './memberColors';

/** Team plan, «Todos»: the tag of the professional an appointment belongs to (undefined otherwise). */
export function useMemberTag() {
  const { isAll, members } = useActing();
  return (appointment: Pick<Appointment, 'proId'> | undefined) => {
    if (!isAll || !appointment) return undefined;
    const index = members.findIndex((m) => m.proId === appointment.proId);
    return index < 0 ? undefined : { label: firstName(members[index].name), ...memberColor(index) };
  };
}
