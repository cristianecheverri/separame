import { screen } from '@testing-library/react';
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
