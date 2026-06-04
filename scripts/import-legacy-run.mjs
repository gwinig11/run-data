import { getLegacyLatestUpload } from "../lib/legacy-store.js";
import { createRunFromUpload } from "../lib/run-store.js";

const upload = await getLegacyLatestUpload();

if (!upload) {
  console.log("No legacy latest activity was found.");
  process.exit(0);
}

const run = await createRunFromUpload(upload, { source: "legacy-import" });
console.log(`Imported legacy run ${run.file.id} (${run.file.name}).`);
