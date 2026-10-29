import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';

// jsdom has no canvas: the shrinking itself is covered by image.test.ts (fitOf).
vi.mock('../lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/image')>()),
  shrinkImage: vi.fn(async () => 'UklGRgAAAABXRUJQVlA4IAAAAAA='),
}));

describe('logo or photo', () => {
  it('uploads it from «Perfil público», shows it instead of the initials and can remove it', async () => {
    const user = userEvent.setup();
    await renderApp('/profile');
    const input = await screen.findByLabelText('Logo o foto');
    await user.upload(input, new File(['x'], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('Listo. Tu página de citas se actualiza en unos segundos.')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('img[src^="data:image/webp"]')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText('Quitamos la imagen. Se ven las iniciales otra vez.')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('img[src^="data:image/webp"]')).toBeNull());
  });
});
