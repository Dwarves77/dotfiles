// Bootstrap for no-npm-resolve-hook.mjs (D7 Fix round 3). Loaded via `node --import
// <this-file> <target-script>`: registers the resolve hook in the SAME process before the target script's
// own imports run, so every one of them is subject to the hook. Never imported directly by a test; only
// ever passed as an `--import` path to a spawned child process. Lives under a `fixtures` directory for
// the same reason its sibling hook file does (see that file's own header).
import { register } from "node:module";

register("./no-npm-resolve-hook.mjs", import.meta.url);
