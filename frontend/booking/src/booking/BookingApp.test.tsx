import { act, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_NOW, MOCK_PROFILE } from '../mock/fixtures';
import { createMockApi } from '../mock/mockApi';
import { BookingApp } from './BookingApp';

function renderApp(query = '', profile = MOCK_PROFILE) {
  const api = createMockApi(new URLSearchParams(`delay=0&${query}`));
  return render(<BookingApp slug={profile.slug} initialProfile={profile} runtime={{ api, turnstileSiteKey: null }} />);
}

const click = (target: string | RegExp | HTMLElement) =>
  fireEvent.click(target instanceof HTMLElement ? target : screen.getByRole('button', { name: target }));
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
/** "Siguiente" re-checks the held hour (async) before moving on: let the mock answer. */
async function next() {
  click('Siguiente');
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
const consent = () => screen.getByRole('checkbox', { name: /Autorizo el tratamiento/ });

async function goToDetails() {
  click(/Valoración/);
  await next();
  click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
  click('10:00 a. m.');
  await next();
}

async function goToReview() {
  expect(isDisabled(screen.getByRole('button', { name: 'Elige un servicio' }))).toBe(true);
  click(/Valoración/);
  await next();
  click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
  click('10:00 a. m.');
  expect(screen.getByRole('button', { name: 'Cambiar servicio: Valoración · 30 min · $60.000' })).toBeTruthy();
  await next();
  expect(screen.getByRole('button', { name: 'Cambiar día y hora: Jue 22 oct · 10:00 a. m.' })).toBeTruthy();
  fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
  fireEvent.input(screen.getByLabelText(/^Correo/), { target: { value: 'mariana@correo.com' } });
  fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
  fireEvent.click(consent());
  await next();
  await screen.findByRole('heading', { name: '¿Todo bien?' });
}

describe('BookingApp', () => {
  // The mock's hours are around MOCK_NOW: the page compares them with the clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MOCK_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('renders the profile instantly and books through the four steps', async () => {
    renderApp();
    expect(screen.getByText('Dra. Laura Pérez')).toBeTruthy();
    expect(screen.getByText('Paso 1 de 4 · Servicio')).toBeTruthy();
    await goToReview();
    expect(screen.getByText('Jueves 22 de octubre')).toBeTruthy();
    // The phone is glued with non-breaking spaces so it never wraps mid-number.
    const contact = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^mariana@correo\.com · \+57/.test(el.textContent ?? ''));
    expect(contact.textContent).toBe('mariana@correo.com · +57\u00a0300\u00a0123\u00a04567');
    click('Separar mi cita');
    expect(await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' })).toBeTruthy();
    expect(screen.getByText('Jueves 22 de octubre · 10:00 a. m.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cancelar o reprogramar' }).getAttribute('href')).toMatch(/^\/c\/mock-/);
  });

  it('disables closed days; full days lead to the waitlist', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    expect(isDisabled(await screen.findByRole('button', { name: 'Domingo 25 de octubre, no hay atención' }))).toBe(true);
    // The first day with free hours comes preselected, its hours already showing.
    expect(screen.getByRole('button', { name: 'Miércoles 21 de octubre', pressed: true })).toBeTruthy();
    expect(screen.getByText('Mañana')).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: 'Elige una hora' }))).toBe(true);
    expect(screen.getByText(/= te avisamos si se libera/)).toBeTruthy();
    const full = screen.getByRole('button', { name: 'Viernes 23 de octubre, lleno' });
    expect(isDisabled(full)).toBe(false);
    expect(full.className).toContain('border-dashed');
    click(full);
    expect(screen.getByText('Ya no quedan horas libres este día.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /¿No encuentras hora\?/ })).toBeTruthy();
    click('Semana siguiente');
    expect(isDisabled(screen.getByRole('button', { name: 'Lunes 2 de noviembre, festivo' }))).toBe(true);
    expect(screen.getByText('Lun 2 es festivo (Todos los Santos).')).toBeTruthy();
  });

  it('shows field errors in Spanish and stays on step 3', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    await next();
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'M' } });
    fireEvent.input(screen.getByLabelText(/^Correo/), { target: { value: 'mariana@' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300' } });
    fireEvent.click(consent());
    await next();
    expect(screen.getByText('Escribe tu nombre completo')).toBeTruthy();
    expect(screen.getByText('Revisa tu correo, parece que le falta algo')).toBeTruthy();
    expect(screen.getByText('El celular debe tener 10 dígitos')).toBeTruthy();
    expect(screen.getByText('Paso 3 de 4 · Tus datos')).toBeTruthy();
  });

  it('sends the client back to step 2 when the slot was taken', async () => {
    renderApp('fail=slot_taken');
    await goToReview();
    click('Separar mi cita');
    expect(await screen.findByText('Alguien acaba de separar esa hora. Elige otra, por favor.')).toBeTruthy();
    expect(screen.getByText('Paso 2 de 4 · Día y hora')).toBeTruthy();
    await screen.findByRole('button', { name: '10:30 a. m.' });
    expect(screen.queryByRole('button', { name: '10:00 a. m.' })).toBeNull();
  });

  describe('holding the picked hour', () => {
    function renderSpied(query = '') {
      const api = createMockApi(new URLSearchParams(`delay=0&${query}`));
      const spies = {
        hold: vi.spyOn(api, 'holdSlot'), book: vi.spyOn(api, 'createBooking'), availability: vi.spyOn(api, 'getAvailability'),
      };
      render(<BookingApp slug={MOCK_PROFILE.slug} initialProfile={MOCK_PROFILE} runtime={{ api, turnstileSiteKey: null }} />);
      return spies;
    }

    async function pickTen() {
      click(/Valoración/);
      await next();
      click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
      click('10:00 a. m.');
    }

    afterEach(() => vi.restoreAllMocks());

    it('holds the hour on tap, says so in «Tus datos», and the booking takes the same hold', async () => {
      const spies = renderSpied();
      await pickTen();
      expect(spies.hold).toHaveBeenCalledTimes(1);
      const { holdId } = spies.hold.mock.calls[0][1];
      expect(spies.hold.mock.calls[0]).toEqual([MOCK_PROFILE.slug, { serviceId: 'valoracion', start: '2026-10-22T15:00:00.000Z', holdId }]);
      // Their own hold never hides the hour from them.
      expect(spies.availability.mock.calls.every(([, query]) => query.holdId === holdId)).toBe(true);
      await next();
      expect(screen.getByText('Te guardamos esta hora 10 minutos.')).toBeTruthy();
      // Leaving «Día y hora» right after the tap reuses that hold (no second call).
      expect(spies.hold).toHaveBeenCalledTimes(1);

      fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
      fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
      fireEvent.click(consent());
      await next();
      click('Separar mi cita');
      await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' });
      expect(spies.book.mock.calls[0][1].holdId).toBe(holdId);
    });

    it('a tapped hour someone else holds sends the client to pick another, before any details', async () => {
      renderSpied('hold=taken');
      await pickTen();
      expect(await screen.findByText('Alguien acaba de separar esa hora. Elige otra, por favor.')).toBeTruthy();
      await screen.findByRole('button', { name: '10:30 a. m.' });
      expect(screen.queryByRole('button', { name: '10:00 a. m.' })).toBeNull();
      expect(isDisabled(screen.getByRole('button', { name: 'Elige una hora' }))).toBe(true);
    });

    it('an hour that already started while the page was open says so', async () => {
      renderSpied('hold=taken');
      click(/Valoración/);
      await next();
      click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
      vi.setSystemTime(new Date('2026-10-22T15:10:00.000Z'));
      click('10:00 a. m.');
      expect(await screen.findByText('Esa hora ya empezó. Elige otra, por favor.')).toBeTruthy();
    });

    it('re-checks the hour when leaving «Tus datos» and goes back to «Día y hora» if it was taken', async () => {
      const spies = renderSpied('hold=next');
      await pickTen();
      await next();
      fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
      fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
      fireEvent.click(consent());
      // The tap's hold is no longer fresh by the time the details are filled in.
      const later = Date.now() + 60_000;
      vi.spyOn(Date, 'now').mockReturnValue(later);
      await next();
      expect(spies.hold).toHaveBeenCalledTimes(2);
      expect(await screen.findByText('Alguien acaba de separar esa hora. Elige otra, por favor.')).toBeTruthy();
      expect(screen.getByText('Paso 2 de 4 · Día y hora')).toBeTruthy();
      expect(spies.book).not.toHaveBeenCalled();
    });
  });

  it('the professional\'s logo replaces the initials; without one the page looks as always', () => {
    const logo = '/media/pros/p1/0123456789abcdef.webp';
    const { container, unmount } = renderApp('', { ...MOCK_PROFILE, logo });
    expect(container.querySelector(`img[src="${logo}"]`)).toBeTruthy();
    expect(screen.queryByText(MOCK_PROFILE.initials)).toBeNull();
    unmount();
    const plain = renderApp();
    expect(plain.container.querySelector('img[src^="/media/"]')).toBeNull();
    expect(screen.getByText(MOCK_PROFILE.initials)).toBeTruthy();
  });

  it('shows a retry message on network errors', async () => {
    renderApp('fail=network');
    await goToReview();
    click('Separar mi cita');
    expect(await screen.findByText('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.')).toBeTruthy();
  });

  it('shows the unavailable screen when the subscription expired', async () => {
    renderApp('state=unavailable');
    expect(await screen.findByText('Agenda no disponible temporalmente')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Llamar · 604 444 1234/ }).getAttribute('href')).toBe('tel:+576044441234');
    expect(screen.getByText(/no se pueden separar citas en línea con Dra\. Laura Pérez\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/pag/i);
  });

  it('uses 3 steps and no service "Cambiar" when there is a single service', async () => {
    renderApp('', { ...MOCK_PROFILE, services: MOCK_PROFILE.services.slice(0, 1) });
    expect(screen.getByText('Paso 1 de 3 · Día y hora')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Cambiar servicio/ })).toBeNull();
    expect(screen.getByText('Valoración · 30 min · $60.000')).toBeTruthy();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    await next();
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
    fireEvent.input(screen.getByLabelText(/^Correo/), { target: { value: 'mariana@correo.com' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '3001234567' } });
    fireEvent.click(consent());
    await next();
    expect(screen.getByText('Paso 3 de 3 · Confirmar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cambiar servicio' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cambiar cuándo' })).toBeTruthy();
  });

  it('jumps back to a step from its chip', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    await next();
    click('Cambiar servicio: Valoración · 30 min');
    expect(screen.getByText('Paso 1 de 4 · Servicio')).toBeTruthy();
  });

  it('deep-links into "Día y hora" with ?service=&date=', async () => {
    history.replaceState(null, '', '/dra-laura-perez?service=limpieza&date=2026-10-30');
    renderApp();
    expect(screen.getByText('Paso 2 de 4 · Día y hora')).toBeTruthy();
    const day = await screen.findByRole('button', { name: 'Viernes 30 de octubre', pressed: true });
    expect(day).toBeTruthy();
    expect(screen.getByRole('button', { name: /Limpieza dental · 45 min/ })).toBeTruthy();
    expect(location.search).toBe('');
  });

  it('ignores an unknown service in the deep link', () => {
    history.replaceState(null, '', '/dra-laura-perez?service=nope&date=2026-10-30');
    renderApp();
    expect(screen.getByText('Paso 1 de 4 · Servicio')).toBeTruthy();
  });

  it('joins the waitlist when nothing is free', async () => {
    renderApp('state=empty');
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: /¿No encuentras hora\?/ }));
    expect(screen.getByRole('heading', { name: 'Te avisamos si se libera un cupo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Domingo 25/ })).toBeNull();
    expect(isDisabled(screen.getByRole('button', { name: 'Elige al menos un día' }))).toBe(true);
    click('Jueves 22 de octubre');
    click('Viernes 23 de octubre');
    expect(screen.getByText('2 de 7')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
    fireEvent.input(screen.getByLabelText(/^Correo/), { target: { value: 'Mariana@Correo.com' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
    fireEvent.click(consent());
    click('Avisarme si se libera');
    expect(await screen.findByRole('heading', { name: 'Listo. Te escribiremos a mariana@correo.com si se libera un cupo.' })).toBeTruthy();
    expect(screen.getByText(/para jue 22 y vie 23/)).toBeTruthy();
  });

  it('caps the waitlist at 7 days and shows API errors', async () => {
    renderApp('state=empty&fail=rate_limited');
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: /¿No encuentras hora\?/ }));
    const pills = screen.getByRole('group', { name: 'Días que te sirven' }).querySelectorAll('button');
    pills.forEach((pill) => fireEvent.click(pill));
    expect(screen.getByText('7 de 7')).toBeTruthy();
    expect([...pills].filter((p) => p.disabled).length).toBe(pills.length - 7);
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
    fireEvent.input(screen.getByLabelText(/^Correo/), { target: { value: 'mariana@correo.com' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '3001234567' } });
    fireEvent.click(consent());
    click('Avisarme si se libera');
    expect(await screen.findByText(/Hiciste varios intentos seguidos/)).toBeTruthy();
  });

  it('restores a half-filled form after a reload', async () => {
    const first = renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    first.unmount();
    renderApp();
    expect(screen.getByText('Paso 2 de 4 · Día y hora')).toBeTruthy();
    expect(await screen.findByRole('button', { name: '10:00 a. m.', pressed: true })).toBeTruthy();
  });

  it('ignores a deep link to a closed or full day: the first day with free hours comes preselected', async () => {
    history.replaceState(null, '', '/dra-laura-perez?service=valoracion&date=2026-10-25');
    renderApp();
    expect(await screen.findByRole('button', { name: 'Domingo 25 de octubre, no hay atención' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Miércoles 21 de octubre', pressed: true })).toBeTruthy();
    expect(screen.queryByText('Ya no quedan horas libres este día.')).toBeNull();
    expect(screen.queryByRole('button', { name: /¿No encuentras hora\?/ })).toBeNull();
  });

  it('drops a pasted or typed +57 / 0057 from the phone field', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    await next();
    const phone = screen.getByLabelText('Celular') as HTMLInputElement;
    expect(phone.maxLength).toBe(24);
    fireEvent.input(phone, { target: { value: '(+57) 300 123 4567' } });
    expect(phone.value).toBe('300 123 4567');
    fireEvent.input(phone, { target: { value: '0057 300 123 4567' } });
    expect(phone.value).toBe('300 123 4567');
  });

  it('says the consent is what is missing when everything else is filled', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    await next();
    expect(isDisabled(screen.getByRole('button', { name: 'Escribe tu nombre para seguir' }))).toBe(true);
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
    expect(isDisabled(screen.getByRole('button', { name: 'Escribe tu celular para seguir' }))).toBe(true);
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
    // The email is optional: name + phone are enough to ask only for the consent.
    expect(isDisabled(screen.getByRole('button', { name: 'Acepta la autorización para seguir' }))).toBe(true);
    fireEvent.click(consent());
    expect(isDisabled(screen.getByRole('button', { name: 'Siguiente' }))).toBe(false);
  });

  it('books without an email: no email promise, the manage link to copy instead', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    await next();
    expect(screen.getByLabelText(/^Correo\s*\(opcional\)$/)).toBeTruthy();
    // Required phone before the optional email; Enter on the last text field submits.
    const fields = [...document.querySelectorAll('input:not([type=checkbox])')] as HTMLInputElement[];
    expect(fields.map((f) => f.name)).toEqual(['name', 'phone', 'email']);
    expect(fields.map((f) => f.getAttribute('enterkeyhint'))).toEqual(['next', 'next', 'done']);
    expect(screen.getByText('Si lo escribes, te enviamos la confirmación y el recordatorio.')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
    fireEvent.click(consent());
    await next();
    await screen.findByRole('heading', { name: '¿Todo bien?' });
    click('Separar mi cita');
    expect(await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' })).toBeTruthy();
    expect(screen.queryByText(/Te enviamos la confirmación/)).toBeNull();
    expect(screen.getByText('No te enviaremos correos')).toBeTruthy();
    const link = screen.getByLabelText('Enlace para cancelar o cambiar tu cita') as HTMLInputElement;
    expect(link.value).toMatch(/\/c\/mock-appt-\d+$/);
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy();
    // Not an iPhone (jsdom): Google Calendar first, Outlook and the .ics under "Otros calendarios".
    expect(screen.getByRole('link', { name: 'Agregar a Google Calendar' }).getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com/);
    expect(screen.getByRole('link', { name: 'Agregar a Outlook' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Descargar archivo .ics' }).getAttribute('href')).toMatch(/^data:text\/calendar/);
  });

  it('remembers the contact on this phone only when asked, and prefills it next time', async () => {
    localStorage.clear();
    const first = renderApp();
    await goToDetails();
    expect(screen.queryByText('Usamos los datos que guardaste en este celular.')).toBeNull();
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
    fireEvent.click(consent());
    fireEvent.click(screen.getByRole('checkbox', { name: /Recordar mis datos en este celular/ }));
    await next();
    click(await screen.findByRole('button', { name: 'Separar mi cita' }));
    await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' });
    expect(JSON.parse(localStorage.getItem('separame:contact') ?? 'null')).toEqual({ name: 'Mariana Gómez', phone: '300 123 4567', email: '' });
    first.unmount();
    sessionStorage.clear();
    history.replaceState(null, '', '/dra-laura-perez');

    renderApp();
    await goToDetails();
    expect(screen.getByText('Usamos los datos que guardaste en este celular.')).toBeTruthy();
    expect((screen.getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('Mariana Gómez');
    expect((screen.getByLabelText('Celular') as HTMLInputElement).value).toBe('300 123 4567');
    // The consent is asked every time.
    expect((consent() as HTMLInputElement).checked).toBe(false);
    localStorage.clear();
  });

  it('checks a typed field when it loses focus; placeholders never look like real data', async () => {
    renderApp();
    await goToDetails();
    const name = screen.getByLabelText('Nombre completo') as HTMLInputElement;
    expect(name.placeholder).toBe('Tu nombre y apellido');
    expect((screen.getByLabelText('Celular') as HTMLInputElement).placeholder).toBe('Tu número de celular');
    expect((screen.getByLabelText(/^Correo/) as HTMLInputElement).placeholder).toBe('Tu correo electrónico');
    fireEvent.blur(name);
    expect(screen.queryByText('Escribe tu nombre completo')).toBeNull();
    fireEvent.input(name, { target: { value: 'M' } });
    fireEvent.blur(name);
    expect(screen.getByText('Escribe tu nombre completo')).toBeTruthy();
  });

  it('shows the full profile band on step 1 with the call button', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Dra. Laura Pérez' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '¿Qué necesitas?' })).toBeTruthy();
    expect(screen.getByText('Cra. 43A #1-50, consultorio 302 · El Poblado')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Llamar · 604 444 1234' }).getAttribute('href')).toBe('tel:+576044441234');
  });

  it('a retry after a lost response gets the same appointment, not "slot taken"', async () => {
    renderApp('fail=lost');
    await goToReview();
    click('Separar mi cita');
    expect(await screen.findByText('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.')).toBeTruthy();
    click('Separar mi cita');
    expect(await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' })).toBeTruthy();
    expect(screen.queryByText(/Alguien acaba de separar esa hora/)).toBeNull();
  });

  it('the waitlist only offers full days, aligned by week, with its own consent text', async () => {
    renderApp();
    click(/Valoración/);
    await next();
    click(await screen.findByRole('button', { name: 'Viernes 23 de octubre, lleno' }));
    click(screen.getByRole('button', { name: /¿No encuentras hora\?/ }));
    const group = screen.getByRole('group', { name: 'Días que te sirven' });
    const offered = [...group.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(offered).toContain('Viernes 23 de octubre');
    expect(offered).not.toContain('Martes 20 de octubre');
    expect(offered).not.toContain('Jueves 22 de octubre');
    expect(group.children.length % 7).toBe(0);
    expect(screen.getByText(/para avisarme si se libera un cupo, según la/)).toBeTruthy();
    expect(screen.getByText('Te avisamos por correo si se libera un cupo.')).toBeTruthy();
  });
});
