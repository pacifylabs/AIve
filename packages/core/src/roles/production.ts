import { RoleRegistry } from './registry.js';

/**
 * The roles this deployment runs, shared by the API (hiring, the inbox) and the worker (running tasks) so the two never
 * disagree. Empty until milestone 3 adds Sales Manager Staff and milestone 4 Social Media Staff. The test-only dummy
 * role is never registered here.
 */
export function buildProductionRegistry(): RoleRegistry {
  return new RoleRegistry();
}
