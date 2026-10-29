import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('«Ayúdanos a mejorar»', () => {
  it('is in the menu and sends an idea, a question or a problem', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Ayúdanos a mejorar' })).length).toBeGreaterThan(0);
    await renderApp('/feedback');
    expect(await screen.findByRole('heading', { name: 'Ayúdanos a mejorar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Algo no funciona' }));
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Cuéntanos un poco más')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tu mensaje'), 'Al cambiar de día no carga la semana.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('heading', { name: '¡Gracias! Ya nos llegó.' })).toBeInTheDocument();
  });
});

describe('Admin · Mensajes', () => {
  it('lists the new messages, counts them in the menu and marks them as answered', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/feedback', { admin: true });
    expect(await screen.findByRole('heading', { name: 'Mensajes' })).toBeInTheDocument();
    const nav = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/admin/feedback')!;
    await waitFor(() => expect(nav.textContent).toBe('Mensajes2 nuevos'));
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    const camilo = screen.getByRole('article', { name: 'Mensaje de Camilo Arango' });
    expect(within(camilo).getByText('Una idea')).toBeInTheDocument();
    expect(within(camilo).getByRole('link', { name: 'Responder' }).getAttribute('href')).toMatch(/^mailto:camilo%40entrena\.co\?subject=/);
    await user.click(within(camilo).getByRole('button', { name: 'Marcar como respondido' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(within(screen.getByRole('article', { name: 'Mensaje de Camilo Arango' })).getByRole('button', { name: 'Marcar como nuevo' })).toBeInTheDocument();
  });
});
