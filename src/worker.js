export default {
  async fetch(request, env) {
    const unauthorized = () =>
      new Response("Anmeldung erforderlich", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Vokabel Zombie", charset="UTF-8"',
        },
      });

    // Fail-Closed: Ohne konfiguriertes Passwort niemals Inhalte ausliefern
    if (!env.AUTH_PASS) {
      return new Response("Server-Konfiguration unvollständig (AUTH_PASS fehlt)", {
        status: 503,
      });
    }

    const authHeader = request.headers.get("Authorization");
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

      if (pass !== env.AUTH_PASS) {
        return unauthorized();
      }

      // Zugriff erlaubt -> Statische Assets (HTML, JS, CSS, MP3) ausliefern
      return env.ASSETS.fetch(request);
    } catch {
      return unauthorized();
    }
  },
};
