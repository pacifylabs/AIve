import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

if (process.env.AI_STAFF_TEST_DATABASE_READY !== '1') {
  throw new Error('Run the database tests with `pnpm test:db` so they get a disposable database.');
}

/**
 * The files share one database, and the engine test counts every due schedule and waiting event in it, so what an
 * earlier file leaves behind matters. Running files in a fixed order, not by how long they took last time, keeps that the same every run.
 */
class AlphabeticalSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  test: {
    include: ['test/**/*.db.spec.ts'],
    fileParallelism: false,
    sequence: { sequencer: AlphabeticalSequencer },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
