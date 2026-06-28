import { getProfile, saveProfile } from "@/lib/profile";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ profile: await getProfile() });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const patch = (await request.json()) as Partial<Profile>;
    const profile = await saveProfile(patch);
    return Response.json({ profile });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
