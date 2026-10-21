import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../mock/mockApi';
import { ManageApp } from './ManageApp';

const api = () => createMockApi(new URLSearchParams('delay=0'));
const click = (target: string | RegExp | HTMLElement) =>
  fireEvent.click(target instanceof HTMLElement ? target : screen.getByRole('button', { name: target }));

describe('ManageApp', () => {
  it('cancels with an optional reason', async () => {
    render(<ManageApp token="demo-token" api={api()} />);
    await screen.findByRole('heading', { name: 'Hola, Mariana. ¿Qué quieres hacer con tu cita?' });
    click(/Cancelar la cita/);
    expect(screen.getByText(/cuéntale a Dra\. Laura Pérez por qué/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'Me salió un viaje' } });
    click('Sí, cancelar la cita');
    expect(await screen.findByRole('heading', { name: 'Tu cita quedó cancelada.' })).toBeTruthy();
    expect(screen.getByText('Cita cancelada')).toBeTruthy();
  });

  it('moves the appointment to a new slot', async () => {
    render(<ManageApp token="demo-token" api={api()} />);
    click(await screen.findByRole('button', { name: /Cambiar día u hora/ }));
    click(await screen.findByRole('button', { name: 'Viernes 23 de octubre' }));
    click('8:30 a. m.');
    click('Mover a vie 23, 8:30 a. m.');
    expect(await screen.findByRole('heading', { name: 'Listo, tu cita cambió.' })).toBeTruthy();
    expect(screen.getByText('Tu nueva cita')).toBeTruthy();
    expect(screen.getByText('Viernes 23 de octubre · 8:30 a. m.')).toBeTruthy();
  });

  it('explains when it is too late or already cancelled', async () => {
    const view = render(<ManageApp token="late" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Ya no se puede cambiar en línea' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Llamar al consultorio/ }).getAttribute('href')).toBe('tel:+576044441234');
    view.unmount();
    render(<ManageApp token="cancelled" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Esta cita ya está cancelada' })).toBeTruthy();
  });

  it('handles a bad link', async () => {
    render(<ManageApp token="invalid" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Este enlace no es válido' })).toBeTruthy();
  });
});
