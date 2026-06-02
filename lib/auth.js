import { cookies } from "next/headers";

export const AUTH_COOKIE = "fit_dashboard_auth";
export const SECRET_HEADER = "x-fit-webhook-secret";

export function configuredSecret() {
  return process.env.FIT_WEBHOOK_SECRET || "dev-secret";
}

export function isConfiguredForProduction() {
  return Boolean(process.env.FIT_WEBHOOK_SECRET);
}

export function timingSafeEqualText(left, right) {
  if (!left || !right || left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function isValidSecret(value) {
  return timingSafeEqualText(String(value || ""), configuredSecret());
}

export async function hasDashboardCookie() {
  const cookieStore = await cookies();
  return isValidSecret(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function hasMutationAccess(request) {
  if (isValidSecret(request.headers.get(SECRET_HEADER))) return true;
  return hasDashboardCookie();
}

export function unauthorizedJson() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
