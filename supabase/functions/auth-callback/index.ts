import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const webAppUrl = Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "https://devix-auth.vercel.app";

function webCallbackUrl() {
  const baseUrl = webAppUrl.endsWith("/") ? webAppUrl : `${webAppUrl}/`;
  return new URL("auth-callback/", baseUrl);
}

Deno.serve((req) => {
  const requestUrl = new URL(req.url);
  const targetUrl = webCallbackUrl();
  const errorCode = requestUrl.searchParams.get("error_code") || requestUrl.searchParams.get("error") || "";

  if (errorCode) {
    targetUrl.searchParams.set("auth_error", errorCode);
  } else if (requestUrl.search) {
    targetUrl.hash = requestUrl.search.slice(1);
  }

  return Response.redirect(targetUrl.toString(), 303);
});
