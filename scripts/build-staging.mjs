import { buildSite } from "./build-site.mjs";
const result = await buildSite();
console.log(`Built staging from commit ${result.manifest.commit}: ${result.output}`);
