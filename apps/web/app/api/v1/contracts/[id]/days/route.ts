import { contractDays } from "../../../../../../src/server/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return contractDays(req, (await ctx.params).id);
}
