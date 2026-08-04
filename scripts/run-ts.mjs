// Runs a script that imports ../lib/*.ts, with the `@/` alias and extensionless
// imports resolved. Node's type stripper handles the TypeScript; it does not
// handle tsconfig's paths, which is what scripts/ts-alias-loader.mjs adds.
//
//   node scripts/run-ts.mjs scripts/backfill-page-assets.mjs
//
// A wrapper rather than a documented --experimental-loader incantation, because
// the incantation is long enough to be copied wrong and the deprecation warning
// it prints looks like an error to whoever is running a one-off on the server.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-alias-loader.mjs", import.meta.url);

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/run-ts.mjs <script.mjs>");
  process.exit(1);
}

await import(pathToFileURL(target).href);
