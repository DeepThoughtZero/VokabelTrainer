export async function onRequest(context) {
  const unauthorized = () =>
    new Response("Anmeldung erforderlich", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Vokabel Zombie", charset="UTF-8"',
      },
    });

  // Fail-Closed: Ohne konfiguriertes Passwort niemals Inhalte ausliefern
  const expectedPass = context.env.AUTH_PASS;
  if (!expectedPass) {
    return new Response("Server-Konfiguration unvollständig (AUTH_PASS fehlt)", {
      status: 503,
    });
  }

  const authHeader = context.request.headers.get("Authorization");
  if (!authHeader) {
    return unauthorized();
  }

  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return unauthorized();
  }

  try {
    const decoded = atob(match[1]);
    const colon = decoded.indexOf(":");
    if (colon < 0) {
      return unauthorized();
    }

    // Benutzername ist beliebig – nur das Passwort wird geprüft
    const pass = decoded.substring(colon + 1);

    if (pass !== expectedPass) {
      return unauthorized();
    }

    // Zugriff erlaubt -> Seite/Asset ausliefern
    return context.next();
  } catch {
    return unauthorized();
  }
}
