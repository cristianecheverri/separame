import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateShort } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { ClientRecord } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { ui } from '../../components/ui/styles';
import { formatPhone } from '../../lib/format';
import { useClients } from '../../lib/queries';
import { useDebounced } from '../../lib/useDebounced';
import { SearchBox, tableHead, th } from '../admin/adminUi';

const dateOrDash = (iso: string | null) => (iso ? formatDateShort(bogotaDate(iso)) : '—');
export const clientPath = (c: Pick<ClientRecord, 'key'>) => `/clients/${encodeURIComponent(c.key)}`;

function Totals({ c }: { c: ClientRecord }) {
  return (
    <span>
      {c.totals.appointments === 1 ? '1 cita' : `${c.totals.appointments} citas`} ·{' '}
      <span className={c.totals.noShows ? 'text-warn-ink font-bold' : undefined}>
        {c.totals.noShows === 1 ? '1 inasistencia' : `${c.totals.noShows} inasistencias`}
      </span>
    </span>
  );
}

/** "Clientes": everyone who booked with the pro, with their history totals. */
export function ClientsPage() {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const clients = useClients(q);
  const list = clients.data?.clients ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Clientes</h1>
          <div className="text-[15px] text-muted">Quiénes te han reservado, con su historial de citas.</div>
        </div>
        <div className="w-full sm:w-auto">
          <SearchBox id="clients-search" value={query} onChange={setQuery} placeholder="Buscar por nombre, correo o celular" />
        </div>
      </div>

      {clients.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[72px] rounded-[20px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-[24px] p-4">
          <EmptyState title={q ? 'No encontramos a nadie con ese dato' : 'Aún no tienes clientes'}>
            {q ? 'Revisa cómo está escrito o busca por el celular.' : 'Cuando alguien reserve, aparece aquí con su historial.'}
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="md:hidden m-0 p-0 list-none flex flex-col gap-3" aria-label="Clientes">
            {list.map((c) => (
              <li key={c.key}>
                <Link to={clientPath(c)} className="bg-white rounded-[20px] p-4 flex flex-col gap-1 no-underline text-ink hover:text-ink border-2 border-white hover:border-line">
                  <span className="font-bold text-[16px] [overflow-wrap:anywhere]">{c.name}</span>
                  <span className="text-[14px] text-muted">{formatPhone(c.phone) || c.email}</span>
                  <span className="text-[13px] text-ink-2">
                    <Totals c={c} />
                  </span>
                  <span className="text-[13px] text-muted">
                    Última: {dateOrDash(c.lastAppointmentAt)} · Próxima: {dateOrDash(c.nextAppointmentAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <section className="hidden md:block bg-white rounded-[24px] pt-2 px-2 pb-3" aria-label="Clientes">
            <div className="overflow-x-auto relative">
              <table className="w-full min-w-[720px] border-collapse text-[14px]">
                <thead>
                  <tr className={tableHead}>
                    <th className={cx(th, 'px-[14px]')}>Cliente</th>
                    <th className={cx(th, 'px-[10px]')}>Celular</th>
                    <th className={cx(th, 'px-[10px]')}>Citas</th>
                    <th className={cx(th, 'px-[10px]')}>Inasistencias</th>
                    <th className={cx(th, 'px-[10px]')}>Última</th>
                    <th className={cx(th, 'px-[10px]')}>Próxima</th>
                    <th className={cx(th, 'px-[14px]')}>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.key} className="border-t border-line">
                      <td className="px-[14px] py-3">
                        <div className="font-bold">{c.name}</div>
                        <div className="text-[13px] text-muted">{c.email || 'Sin correo'}</div>
                      </td>
                      <td className="px-[10px] py-3 whitespace-nowrap">{formatPhone(c.phone) || '—'}</td>
                      <td className="px-[10px] py-3">{c.totals.appointments}</td>
                      <td className="px-[10px] py-3">
                        {c.totals.noShows ? <span className={cx(ui.badge, 'bg-warn-soft text-warn-ink')}>{c.totals.noShows}</span> : <span className="text-muted">0</span>}
                      </td>
                      <td className="px-[10px] py-3 whitespace-nowrap text-ink-2">{dateOrDash(c.lastAppointmentAt)}</td>
                      <td className="px-[10px] py-3 whitespace-nowrap text-ink-2">{dateOrDash(c.nextAppointmentAt)}</td>
                      <td className="px-[14px] py-3 text-right">
                        <Link to={clientPath(c)} className="font-bold text-[14px] inline-flex items-center min-h-11 underline underline-offset-2" aria-label={`Ver ${c.name}`}>
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
