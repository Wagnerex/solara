import { createClient } from "@/utils/supabase/middleware";
import { type NextRequest } from "next/server";

export const middleware = (request: NextRequest) => {
  return createClient(request);
};

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
};
