import { cookies } from "next/headers";
import { AUTH_COOKIE, isValidSecret } from "lib/auth.js";

export async function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (isValidSecret(key)) {
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE, key, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return Response.redirect(new URL("/", request.url), 303);
}
