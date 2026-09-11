// Spawn fixture for is-main.test.mjs. Exists ONLY to be invoked as `node is-main-fixture.mjs` via
// execFileSync so the test exercises Node's REAL argv[1] and import.meta.url values on this platform.
// The Windows defect this primitive fixes (see is-main.mjs's header) only reproduces under a genuine
// `node <file>` invocation, never inside a mocked in-process unit test, so this fixture is required, not
// convenience.
import { isMainModule } from './is-main.mjs';

if (isMainModule(import.meta.url)) {
  console.log('main');
}
