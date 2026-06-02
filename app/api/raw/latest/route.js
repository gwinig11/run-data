import { getLatestRawFile } from "lib/blob-store.js";
import { hasMutationAccess, unauthorizedJson } from "lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!(await hasMutationAccess(request))) return unauthorizedJson();
  const raw = await getLatestRawFile();
  if (!raw) return new Response("No file uploaded yet.", { status: 404 });

  return new Response(raw.stream || raw.buffer, {
    headers: {
      "Content-Type": raw.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${escapeHeader(raw.filename)}"`,
    },
  });
}

function escapeHeader(value) {
  return String(value).replaceAll(/["\r\n]/g, "_");
}
