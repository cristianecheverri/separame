import { describe, expect, it } from 'vitest';
import { rewrite } from './index';

const raw = [
  'Return-Path: <cliente@correo.com>',
  'From: Cliente <cliente@correo.com>',
  'To: soporte@separame.app',
  'Subject: Quiero borrar mis datos',
  'DKIM-Signature: v=1; a=rsa-sha256;',
  '\tbh=abc',
  'X-SES-Spam-Verdict: PASS',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hola, ¿pueden borrar mis datos?',
].join('\r\n');

describe('mail-forward rewrite', () => {
  it('sends it from our domain, Reply-To the person who wrote, keeping subject and body', () => {
    const out = rewrite(raw, 'soporte@separame.app')!;
    const [head, body] = out.split('\r\n\r\n');
    expect(head).toContain('From: Sepárame · soporte <soporte@separame.app>');
    expect(head).toContain('Reply-To: Cliente <cliente@correo.com>');
    expect(head).toContain('Subject: Quiero borrar mis datos');
    expect(head).not.toMatch(/DKIM-Signature|bh=abc|Return-Path/);
    expect(body).toBe('Hola, ¿pueden borrar mis datos?');
  });

  it('drops what SES flags as spam or a virus', () => {
    expect(rewrite(raw.replace('X-SES-Spam-Verdict: PASS', 'X-SES-Spam-Verdict: FAIL'), 'soporte@separame.app')).toBeNull();
    expect(rewrite(raw.replace('X-SES-Spam-Verdict: PASS', 'X-SES-Virus-Verdict: FAIL'), 'soporte@separame.app')).toBeNull();
  });
});
