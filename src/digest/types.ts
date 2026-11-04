// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night, folded from its log lines. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as '—'
  runs: number; // log lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // most recent error seen for this job, null if none
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse; counted, never thrown
};

// null when there is no runs/<night>.jsonl (or night isn't YYYY-MM-DD). An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
