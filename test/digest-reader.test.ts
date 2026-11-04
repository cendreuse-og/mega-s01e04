import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  it('folds runs/2026-10-28.jsonl into 5 jobs and counts 1 bad line', () => {
    const night = readNight('runs', '2026-10-28')!;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const refresh = night.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });

    const backup = night.rows.find((r) => r.job === 'notes/backup')!;
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');

    expect(night.rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
  });

  it('returns null for a night with no file, or a night that is not a date', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../.env')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });

  it('counts lines with the wrong shape as bad', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-11-02.jsonl'),
      ['{"at":"t","job":"a","status":"ok","owner":"x"}', '{"at":"t","job":"a","status":"maybe","owner":"x"}', '42', 'null'].join('\n'),
    );
    const night = readNight(dir, '2026-11-02')!;
    expect(night.badLines).toBe(3);
    expect(night.rows).toHaveLength(1);
  });
});
