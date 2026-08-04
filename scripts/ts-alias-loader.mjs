// Node's type stripper runs TypeScript directly but resolves modules the way
// Node does, which knows nothing about the `@/` alias tsconfig.json defines or
// about extensionless imports. Every module under lib/ uses both, so a script
// that imports one gets ERR_MODULE_NOT_FOUND before running a line.
//
// Registered by scripts/run-ts.mjs, which is how the backfill scripts are run.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);

export async function resolve(specifier, context, next) {
  let target = specifier;

  if (target.startsWith("@/")) {
    target = new URL(target.slice(2), ROOT).href;
  }

  // Extensionless relative and aliased imports: lib/page-html → lib/page-html.ts.
  // Only ever adds .ts, because that is the only extension these modules use.
  if (target.startsWith("file:") || target.startsWith(".")) {
    const url = target.startsWith("file:")
      ? new URL(target)
      : new URL(target, context.parentURL);
    if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(fileURLToPath(`${url.href}.ts`))) {
      target = `${url.href}.ts`;
    } else {
      target = url.href;
    }
  }

  return next(target, context);
}

export { pathToFileURL };
