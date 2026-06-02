import { clearActivities } from "lib/blob-store.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!(await hasMutationAccess(request))) return unauthorizedJson();
  await clearActivities();

  if (String(request.headers.get("accept") || "").includes("text/html")) {
    return Response.redirect(new URL("/", request.url), 303);
  }
  return Response.json({ ok: true, file: null });
}
