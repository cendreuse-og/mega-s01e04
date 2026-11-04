import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null = 'rook', error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  const write = (night: string, lines: string[]) => writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n') + '\n');

  // Lines are deliberately out of job order; retries >= 3 and a fail on 'a/flaky' and 'z/broken'.
  write('2026-11-01', [
    line('2026-11-02T01:00:00+01:00', 'z/broken', 'fail', 'rook', 'boom'),
    line('2026-11-02T01:01:00+01:00', 'a/flaky', 'retry'),
    line('2026-11-02T01:02:00+01:00', 'a/flaky', 'retry'),
    line('2026-11-02T01:03:00+01:00', 'a/flaky', 'retry'),
    line('2026-11-02T01:04:00+01:00', 'a/flaky', 'ok'),
    line('2026-11-02T01:05:00+01:00', 'm/steady', 'ok'),
  ]);
  writeFileSync(join(runsDir, '2026-11-02.jsonl'), '');
  write('2026-11-03', ['not json', line('2026-11-04T01:00:00+01:00', 'm/steady', 'ok')]);

  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

describe('GET /digest/:night', () => {
  it('lists the jobs sorted by job and marks retries >= 3 and fail with class="warn"', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const order = ['a/flaky', 'm/steady', 'z/broken'].map((j) => html.indexOf(`<td>${j}</td>`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-11-09')).status).toBe(404);
  });

  it('empty night says nothing ran', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('reports a bad line and still shows the good rows', async () => {
    const res = await app.request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line(s) didn&#39;t parse');
    expect(html).toContain('<td>m/steady</td>');
  });
});

describe('GET /api/digest/:night', () => {
  it('rows are sorted by job, same order as the page', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    const data = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(data.rows.map((r) => r.job)).toEqual(['a/flaky', 'm/steady', 'z/broken']);
    expect(data.rows[0]).toMatchObject({ retries: 3, lastStatus: 'ok' });
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/api/digest/2026-11-09')).status).toBe(404);
  });

  it('empty night is 200 with no rows and no bad lines', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-11-02', rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await app.request('/api/digest/2026-11-03');
    const data = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(data.badLines).toBe(1);
    expect(data.rows.map((r) => r.job)).toEqual(['m/steady']);
  });
});
