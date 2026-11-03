import type { RoleDefinition, TaskDefinition } from './types.js';

/** Thrown at registration, so a malformed role fails at start-up rather than mid-run. */
export class RoleDefinitionError extends Error {}

/**
 * The roles this deployment can hire, keyed by role key, with every task reachable by its type. Adding a role is a
 * `register` call; nothing else in the platform changes.
 */
export class RoleRegistry {
  private readonly roles = new Map<string, RoleDefinition>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tasks, see RoleDefinition.tasks
  private readonly tasks = new Map<string, { role: RoleDefinition; task: TaskDefinition<any, any> }>();

  register(role: RoleDefinition): this {
    if (this.roles.has(role.key)) throw new RoleDefinitionError(`Role "${role.key}" is already registered.`);
    for (const task of role.tasks) {
      if (!task.type.startsWith(`${role.key}.`)) {
        throw new RoleDefinitionError(`Task "${task.type}" must be named "${role.key}.<task>".`);
      }
      if (this.tasks.has(task.type)) throw new RoleDefinitionError(`Task "${task.type}" is registered twice.`);
      if (Boolean(task.model) === Boolean(task.execute)) {
        throw new RoleDefinitionError(`Task "${task.type}" needs exactly one of a model or an execute function.`);
      }
      if (task.model && (!task.outputSchema || !task.buildPrompt)) {
        throw new RoleDefinitionError(`Model task "${task.type}" needs an output schema and a prompt.`);
      }
      if (task.risk === 'acts_external' && task.defaultAutonomy === 'act') {
        throw new RoleDefinitionError(`Task "${task.type}" acts externally, so it cannot default to acting alone.`);
      }
      this.tasks.set(task.type, { role, task });
    }
    for (const subscription of role.subscribes) {
      if (!role.tasks.some((task) => task.type === subscription.task)) {
        throw new RoleDefinitionError(
          `Role "${role.key}" subscribes "${subscription.task}", which it does not define.`,
        );
      }
    }
    this.roles.set(role.key, role);
    return this;
  }

  role(key: string): RoleDefinition {
    const role = this.roles.get(key);
    if (!role) throw new RoleDefinitionError(`No role "${key}" is registered.`);
    return role;
  }

  hasRole(key: string): boolean {
    return this.roles.has(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous tasks, see RoleDefinition.tasks
  task(type: string): { role: RoleDefinition; task: TaskDefinition<any, any> } {
    const entry = this.tasks.get(type);
    if (!entry) throw new RoleDefinitionError(`No task "${type}" is registered.`);
    return entry;
  }

  /** Whether this deployment runs a task type. Stored rows can name tasks of roles that are switched off here. */
  hasTask(type: string): boolean {
    return this.tasks.has(type);
  }

  allRoles(): RoleDefinition[] {
    return [...this.roles.values()];
  }

  /** Every task that listens for an event, across roles. */
  subscribersOf(event: string) {
    return this.allRoles().flatMap((role) =>
      role.subscribes
        .filter((subscription) => subscription.event === event)
        .map((subscription) => ({ role, subscription })),
    );
  }
}
