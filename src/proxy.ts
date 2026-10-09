import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

// Chequeo optimista: solo mira la cookie. La verificación real está en getCurrentUser().
export default async function proxy(req: NextRequest) {
  const session = await decrypt(req.cookies.get("session")?.value);
  const isLogin = req.nextUrl.pathname === "/login";

  if (!session && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (session && isLogin) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
