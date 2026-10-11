import { isMainModule } from './is-main.mjs';

if (isMainModule(import.meta.url)) {
  console.log('main');
}
