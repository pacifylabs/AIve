import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RoleDefinitionError, RoleRegistry } from './registry.js';
import type { RoleDefinition, TaskDefinition } from './types.js';

const task = (overrides: Partial<TaskDefinition> = {}): TaskDefinition => ({
  type: 'demo.write',
  name: 'Write',
  risk: 'drafts',
  defaultAutonomy: 'act',
  triggers: [{ person: true }],
  inputSchema: z.object({}),
  execute: async () => ({}),
  toEffects: () => [],
  ...overrides,
});

const role = (overrides: Partial<RoleDefinition> = {}): RoleDefinition => ({
  key: 'demo',
  version: 1,
  name: 'Demo',
  summary: '',
  jobDescription: [],
  settingsSchema: z.object({}),
  interview: [],
  tasks: [task()],
  subscribes: [],
  emits: [],
  ...overrides,
});

describe('RoleRegistry', () => {
  it('registers a role and finds its tasks and subscribers', () => {
    const registry = new RoleRegistry().register(
      role({ subscribes: [{ event: 'lead.created', task: 'demo.write', input: () => ({}) }] }),
    );
    expect(registry.task('demo.write').role.key).toBe('demo');
    expect(registry.subscribersOf('lead.created')).toHaveLength(1);
    expect(registry.subscribersOf('post.published')).toHaveLength(0);
  });

  it.each([
    ['a task outside the role namespace', role({ tasks: [task({ type: 'other.write' })] })],
    ['a task with both a model and execute', role({ tasks: [task({ model: { name: 'fake', maxTokens: 10 } })] })],
    [
      'a model task without a prompt',
      role({ tasks: [task({ execute: undefined, model: { name: 'fake', maxTokens: 10 } })] }),
    ],
    ['an external action that defaults to acting alone', role({ tasks: [task({ risk: 'acts_external' })] })],
    [
      'a subscription to a task it does not define',
      role({ subscribes: [{ event: 'x', task: 'demo.missing', input: () => ({}) }] }),
    ],
  ])('refuses %s', (_case, definition) => {
    expect(() => new RoleRegistry().register(definition)).toThrow(RoleDefinitionError);
  });

  it('refuses registering the same role twice', () => {
    expect(() => new RoleRegistry().register(role()).register(role())).toThrow(RoleDefinitionError);
  });
});
