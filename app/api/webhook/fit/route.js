import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";
import { saveActivity } from "lib/blob-store.js";
import { extractUploadedFit } from "lib/uploads.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!(await hasMutationAccess(request))) return unauthorizedJson();

    const upload = await extractUploadedFit(request);
    const summary = await saveActivity(upload);

    if (acceptsHtml(request)) return Response.redirect(new URL("/", request.url), 303);
    return Response.json({ ok: true, file: summary.file }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Upload failed." },
      { status: error.status || 500 },
    );
  }
}

function acceptsHtml(request) {
  return String(request.headers.get("accept") || "").includes("text/html");
}
