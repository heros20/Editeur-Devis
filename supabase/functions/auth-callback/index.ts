import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const localCallbackUrl = "http://127.0.0.1:43177/auth-callback";
const desktopRedirectUrl = "atelier://app/index.html";

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve((req) => {
  const requestUrl = new URL(req.url);
  const localCallback = `${localCallbackUrl}${requestUrl.search}`;
  const deepLink = `${desktopRedirectUrl}${requestUrl.search}`;
  const safeLocalCallback = escapeHtml(localCallback);
  const safeDeepLink = escapeHtml(deepLink);

  return htmlResponse(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ouverture de Devix</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: Arial, sans-serif;
        color: #20332f;
        background: #f6f3ee;
      }
      main {
        width: min(520px, 100%);
        display: grid;
        gap: 14px;
        padding: 24px;
        border: 1px solid #ded5cb;
        border-radius: 8px;
        background: white;
      }
      h1 {
        margin: 0;
        font-size: 24px;
      }
      p {
        margin: 0;
        color: #62564e;
        line-height: 1.45;
      }
      a {
        margin-right: 8px;
        width: fit-content;
        min-height: 38px;
        display: inline-flex;
        align-items: center;
        padding: 0 14px;
        border-radius: 6px;
        background: #1f5f52;
        color: white;
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Ouverture de Devix</h1>
      <p id="status">Connexion valide. Devix va finaliser la connexion dans la fenetre deja ouverte.</p>
      <p id="fallback" hidden>Vous pouvez fermer cette page si le navigateur ne l'a pas fermee automatiquement.</p>
      <div>
        <a id="openLocal" href="${safeLocalCallback}">Finaliser dans Devix</a>
        <a id="openApp" href="${safeDeepLink}">Ouvrir Devix</a>
      </div>
    </main>
    <script>
      const localCallback = ${JSON.stringify(localCallback)};
      const status = document.getElementById("status");
      const fallback = document.getElementById("fallback");

      function closeThisTab() {
        window.setTimeout(() => window.close(), 250);
        window.setTimeout(() => {
          fallback.hidden = false;
        }, 1400);
      }

      async function finalizeInDevix() {
        try {
          await fetch(localCallback, { cache: "no-store" });
          status.textContent = "Connexion terminee dans Devix. Fermeture de cette page...";
          closeThisTab();
        } catch {
          window.location.href = localCallback;
        }
      }

      finalizeInDevix();
    </script>
  </body>
</html>`);
});
