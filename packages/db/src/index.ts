// TypeORM is re-exported so every app uses the same instance as the entities defined here.
export { DataSource, EntityManager, In, IsNull, LessThan, MoreThan, QueryFailedError } from 'typeorm';
export * from './data-source.js';
export * from './entities/base.entity.js';
export * from './entities/early-access.entity.js';
export * from './entities/identity.entities.js';
export * from './entities/workspace.entities.js';
export * from './tenant.js';

/** Postgres error code for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';
