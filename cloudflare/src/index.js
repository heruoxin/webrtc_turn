// Copyright (C) 2026 webrtc_turn contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Cloudflare Realtime caps credential lifetime at 48 hours.
const TTL_SECONDS = 86400;

// The setup page is reachable only for this long after a deployment, so an
// abandoned worker does not keep handing its URL to whoever finds it.
const SETUP_WINDOW_MS = 30 * 60 * 1000;

const encode = (value) => new TextEncoder().encode(value);

// Every response here carries either the access token or credentials minted
// from it, so none of them may be stored by a cache along the way.
const respond = (body, status, type) =>
  new Response(body, {
    status,
    headers: { "content-type": type, "cache-control": "no-store" },
  });

const json = (body, status) => respond(JSON.stringify(body), status, "application/json");

const text = (body, status) => respond(body, status, "text/plain; charset=utf-8");

const html = (body, status) => respond(body, status, "text/html; charset=utf-8");

// Deriving the access token from the API token keeps it stable across
// redeployments, so a URL already saved in the app never stops working.
async function accessToken(env) {
  if (env.ACCESS_TOKEN) return env.ACCESS_TOKEN;

  const key = await crypto.subtle.importKey(
    "raw",
    encode(env.TURN_KEY_API_TOKEN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encode("webrtc_turn/access/v1"));
  return [...new Uint8Array(signature).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Digesting first makes the comparison independent of the length of the
// supplied token, which timingSafeEqual would otherwise leak.
async function tokenMatches(supplied, expected) {
  const digest = (value) => crypto.subtle.digest("SHA-256", encode(value));
  return crypto.subtle.timingSafeEqual(await digest(supplied), await digest(expected));
}

const PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.catchingnow.andfiles.helper" +
  "&referrer=utm_source%3Dturn_worker%26utm_medium%3Dreferral%26utm_campaign%3Dsetup_page";

function setupPage(relayUrl) {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Your relay URL</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, sans-serif; margin: 0 auto; padding: 2rem 1.25rem; max-width: 34rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; }
  code { display: block; word-break: break-all; padding: .75rem; border: 1px solid; border-radius: .5rem; font-size: .9rem; }
  button { font: inherit; padding: .5rem 1rem; border-radius: .5rem; cursor: pointer; margin: 1rem 0; }
  .store-badge { display: inline-flex; align-items: center; gap: 11px; width: 180px; height: 54px; margin: 0 0 2rem; padding: 9px 16px 9px 14px; box-sizing: border-box; text-decoration: none; border-radius: 11px; color: #fff; background: #000; border: 1px solid rgba(255, 255, 255, .18); }
  .store-badge svg { width: 29px; height: 32px; flex: none; }
  .store-badge small { display: block; font-size: 10px; font-weight: 520; line-height: 1.1; letter-spacing: .01em; opacity: .72; }
  .store-badge b { display: block; margin-top: 2px; font-size: 16px; font-weight: 620; line-height: 1.05; }
</style>
<h1>Your relay URL</h1>
<p>Paste this into <b>Remote access &gt; Relay server</b> on your Android device.</p>
<code id="url">${relayUrl}</code>
<button id="copy">Copy</button>
<p>Don't have the app on that device yet?</p>
<a class="store-badge" href="${PLAY_URL}" target="_blank" rel="noopener noreferrer" aria-label="Get AndroMeld on Google Play">
  <svg viewBox="12 8 33 37" aria-hidden="true">
    <path fill="#EA4335" d="m27.622 25.899-14.194 15.066.002.009a3.84 3.84 0 0 0 5.648 2.312l.046-.026 15.978-9.22-7.48-8.141"/>
    <path fill="#FBBC04" d="m41.983 23.334-.014-.009-6.898-3.999-7.772 6.915 7.799 7.798 6.862-3.959a3.838 3.838 0 0 0 .023-6.746"/>
    <path fill="#4285F4" d="M13.426 12.37a3.8 3.8 0 0 0-.13.987V39.98c0 .342.044.672.13.985L28.11 26.284 13.426 12.37"/>
    <path fill="#34A853" d="m27.727 26.668 7.347-7.345-15.96-9.254a3.84 3.84 0 0 0-5.687 2.297v.004l14.3 14.298"/>
  </svg>
  <span>
    <small>Get it on</small>
    <b>Google Play</b>
  </span>
</a>
<p>This URL contains your private token. Anyone who has it can send traffic through your relay, so keep it to yourself.</p>
<p>This page closes 30 minutes after each deployment. To open it again, redeploy the worker from <b>Workers &amp; Pages &gt; your worker &gt; Deployments</b>.</p>
<script>
  const button = document.getElementById("copy");
  button.onclick = async () => {
    await navigator.clipboard.writeText(document.getElementById("url").textContent);
    button.textContent = "Copied";
  };
</script>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/") {
      return text("Not found", 404);
    }

    const expected = await accessToken(env);
    const supplied = url.searchParams.get("token");

    if (supplied === null) {
      const age = Date.now() - Date.parse(env.CF_VERSION_METADATA.timestamp);
      if (age > SETUP_WINDOW_MS) {
        return text(
          "This page is closed. Redeploy the worker from Workers & Pages > your worker > Deployments to open it for another 30 minutes.",
          404,
        );
      }
      return html(setupPage(`${url.origin}/?token=${encodeURIComponent(expected)}`), 200);
    }

    if (!(await tokenMatches(supplied, expected))) {
      return text("Wrong token. Check the relay URL you pasted into the app.", 401);
    }

    const generated = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );

    if (!generated.ok) {
      console.error("Realtime TURN credential request failed", generated.status, await generated.text());
      return text("Cloudflare didn't issue credentials. Check the TURN key id and API token.", 502);
    }

    const { iceServers } = await generated.json();

    // Cloudflare also returns a STUN-only entry. The app contract accepts
    // relay URLs only, so drop everything that isn't turn: or turns:.
    const relays = iceServers
      .map((server) => ({
        ...server,
        urls: server.urls.filter((u) => u.startsWith("turn:") || u.startsWith("turns:")),
      }))
      .filter((server) => server.urls.length > 0);

    return json({ iceServers: relays, ttl: TTL_SECONDS }, 200);
  },
};
