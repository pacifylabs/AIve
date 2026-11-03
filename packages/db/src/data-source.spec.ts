import { describe, expect, it } from 'vitest';
import { createDataSource } from './data-source.js';

const base = { host: 'localhost', port: 5432, database: 'app', username: 'u', password: 'p' };

describe('createDataSource', () => {
  it('connects without TLS by default, for local Postgres', () => {
    expect(createDataSource(base).options).toMatchObject({ ssl: false });
  });

  it('turns TLS on and verifies the server certificate when asked', () => {
    expect(createDataSource({ ...base, ssl: true }).options).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });
});
