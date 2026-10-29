import { DynamoDBDocumentClient, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { PRO_ID, setTestEnv } from '../testing/fixtures';
import { DEFAULT_RULES } from '../../shared/availability';
import { addBlocks, BLOCK_RETENTION_DAYS, effectiveRules, RULES_VERSION } from './availability';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
});

describe('addBlocks', () => {
  it('expires the block 30 days after it ends, so availability never reads old blocks', async () => {
    const end = '2026-10-22T23:00:00.000Z';
    await addBlocks(PRO_ID, { label: 'Vacaciones', start: '2026-10-20T13:00:00.000Z', end }, new Date('2026-10-19T00:00:00.000Z'));
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(item.ttl).toBe(Date.parse(end) / 1000 + BLOCK_RETENTION_DAYS * 86_400);
    expect(item).toMatchObject({ PK: `PRO#${PRO_ID}`, label: 'Vacaciones', end });
  });

  it('without a reason the block is «No disponible»', async () => {
    const [block] = await addBlocks(PRO_ID, { start: '2026-10-20T19:00:00.000Z', end: '2026-10-20T21:00:00.000Z' });
    expect(block.label).toBe('No disponible');
  });

  it('«Varios días» with hours: the same hours every day, written in one transaction', async () => {
    // Tue 20 – Fri 23 Oct, 2:00–4:00 p. m. Bogotá.
    const blocks = await addBlocks(PRO_ID, { label: 'Diligencia', start: '2026-10-20T19:00:00.000Z', end: '2026-10-20T21:00:00.000Z', repeatUntil: '2026-10-23' });
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      ['2026-10-20T19:00:00.000Z', '2026-10-20T21:00:00.000Z'],
      ['2026-10-21T19:00:00.000Z', '2026-10-21T21:00:00.000Z'],
      ['2026-10-22T19:00:00.000Z', '2026-10-22T21:00:00.000Z'],
      ['2026-10-23T19:00:00.000Z', '2026-10-23T21:00:00.000Z'],
    ]);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(4);
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(tx).toHaveLength(4);
    expect(tx.every((t) => t.Put!.Item!.label === 'Diligencia')).toBe(true);
  });
});

describe('effectiveRules', () => {
  it('the old default 10-minute margin saved at sign-up reads as «Sin margen»', () => {
    expect(effectiveRules({ rules: { ...DEFAULT_RULES, bufferMin: 10 } }).bufferMin).toBe(0);
  });
  it('a margin chosen in Disponibilidad since then is kept (also 10)', () => {
    expect(effectiveRules({ rules: { ...DEFAULT_RULES, bufferMin: 10 }, rulesVersion: RULES_VERSION }).bufferMin).toBe(10);
    expect(effectiveRules({ rules: { ...DEFAULT_RULES, bufferMin: 15 } }).bufferMin).toBe(15);
  });
  it('no settings yet: the defaults (no margin)', () => {
    expect(effectiveRules(undefined)).toEqual(DEFAULT_RULES);
  });
});
