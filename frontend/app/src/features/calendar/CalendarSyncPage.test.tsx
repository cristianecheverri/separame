import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';

const FEED = /\/public\/calendar\/demoToken7f3a9c1e5b2d4086\.ics$/;

describe('Tu calendario', () => {
  it('renders both options with the feed links', async () => {
    await renderApp('/calendar-sync');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ve tus citas en tu calendario' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Invitaciones por correo' })).toBeInTheDocument();
    expect((screen.getByLabelText('Enlace de tu calendario') as HTMLInputElement).value).toMatch(FEED);
    expect(screen.getByRole('link', { name: /Google Calendar/ })).toHaveAttribute('href', expect.stringContaining('calendar.google.com'));
    expect(screen.getByRole('link', { name: /Apple \/ iPhone/ })).toHaveAttribute('href', expect.stringMatching(/^webcal:\/\//));
    expect(screen.getByRole('link', { name: /Outlook/ })).toHaveAttribute('target', '_blank');
  });

  it('toggles invitations optimistically', async () => {
    const user = userEvent.setup();
    await renderApp('/calendar-sync');
    const toggle = await screen.findByRole('button', { name: 'Recibir invitaciones por correo' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText('Ya no te enviaremos invitaciones.')).toBeInTheDocument();
  });

  it('copies the feed link', async () => {
    const user = userEvent.setup();
    await renderApp('/calendar-sync');
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toMatch(FEED);
  });

  it('rotates the link after confirming', async () => {
    const user = userEvent.setup();
    await renderApp('/calendar-sync');
    const field = (await screen.findByLabelText('Enlace de tu calendario')) as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: 'Cambiar enlace' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cambiar el enlace?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cambiar enlace' }));
    await waitFor(() => expect(field.value).not.toMatch(FEED));
    expect(field.value).toMatch(/\/public\/calendar\/demoToken[0-9a-f]+\.ics$/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays usable when the plan expired', async () => {
    await renderApp('/calendar-sync', { state: 'expired' });
    expect(await screen.findByRole('button', { name: 'Recibir invitaciones por correo' })).toBeEnabled();
  });

  it('is linked from the agenda', async () => {
    await renderApp('/');
    expect(await screen.findByRole('link', { name: 'Sincroniza tu calendario →' })).toHaveAttribute('href', '/calendar-sync');
  });
});
