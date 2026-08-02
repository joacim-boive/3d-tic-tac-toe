import { APP_BUILD_ID, APP_VERSION } from "@/appVersion";

export const dynamic = "force-dynamic";

/** Live deploy fingerprint — always uncached so home-screen shells can compare. */
export function GET() {
  return Response.json(
    { version: APP_VERSION, buildId: APP_BUILD_ID },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
