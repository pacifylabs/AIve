import { RoleRegistry } from '@ai-staff/core';
import { salesManagerRole } from './role.js';

/**
 * The roles this deployment runs, shared by the API (hiring, the inbox) and the worker (running tasks) so the two never
 * disagree. Social Media Staff joins in Milestone 4. The test-only dummy role is never registered here.
 */
export function buildProductionRegistry(): RoleRegistry {
  return new RoleRegistry().register(salesManagerRole);
}
