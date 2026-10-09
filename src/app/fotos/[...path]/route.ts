import { getSession } from "@/lib/session";
import { readFileBytes } from "@/lib/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Sirve las fotos de los tickets solo a usuarios con sesión.
export async function GET(_req: Request, ctx: RouteContext<"/fotos/[...path]">) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });

  const { path } = await ctx.params;
  const pathname = path.join("/");
  const data = await readFileBytes(pathname);
  if (!data) return new Response("No encontrado", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[pathname.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
