import { NextResponse } from "next/server";

// Les pages de navigation sont maintenant gérées côté NestJS.
// Cette route reste pour compatibilité mais les pages ne nécessitent plus de seeding
// car la navigation est statique dans le frontend.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ message: "Pages seeding not required — navigation is static." });
}
