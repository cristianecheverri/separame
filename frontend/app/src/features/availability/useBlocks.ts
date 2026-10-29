import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type BlockResponse, type CreateBlockRequest } from '@shared/api';
import type { Block } from '@shared/types';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { keys, useActing } from '../../lib/queries';

/**
 * Blocked periods of the selected professional: create («No estaré disponible»)
 * and remove with «Deshacer» — the same from Disponibilidad and from the agenda.
 * Every change refreshes the availability (blocks, agenda rows) and the slots.
 */
export function useBlocks() {
  const qc = useQueryClient();
  const { proId, header } = useActing();
  const acting = { actingProId: header };
  const toast = useToast();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.availability(proId) });
    void qc.invalidateQueries({ queryKey: keys.slotsAll });
  };

  const create = useMutation({
    mutationFn: (body: CreateBlockRequest) => api.post<BlockResponse>(apiPaths.blocks(), body, acting),
    onSuccess: () => refresh(),
  });

  const restore = useMutation({
    mutationFn: (block: Block) => api.post<BlockResponse>(apiPaths.blocks(), { label: block.label, start: block.start, end: block.end }, acting),
    onSuccess: (_res, block) => {
      refresh();
      toast.success(`Volviste a bloquear «${block.label}».`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (block: Block) => api.del(apiPaths.block(block.id), acting),
    onSuccess: (_res, block) => {
      refresh();
      toast.show(`Quitaste «${block.label}». Ya se puede reservar en esas fechas.`, 'success', { label: 'Deshacer', onClick: () => restore.mutate(block) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return { create, remove };
}
