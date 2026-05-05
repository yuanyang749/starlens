import { ok } from "@/lib/api-response";

export function POST() {
  return ok({
    status: "started",
    startedAt: new Date().toISOString(),
  });
}
