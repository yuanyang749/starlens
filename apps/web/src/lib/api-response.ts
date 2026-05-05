import { NextResponse } from "next/server";

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}
