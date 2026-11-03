import { RoleRegistry } from '@ai-staff/core';
import { socialMediaRole } from '@ai-staff/role-social';
import { salesManagerRole } from '@ai-staff/role-sales';

/**
 * The roles this deployment runs, shared by the API (hiring, the inbox) and the worker (running tasks) so the two never
 * disagree. The test-only dummy role is never registered here.
 */
export function buildProductionRegistry(): RoleRegistry {
  return new RoleRegistry().register(salesManagerRole).register(socialMediaRole);
}
