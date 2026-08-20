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

import { qrSvg } from "./qr.js";

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

function setupPage(relayUrl) {
  const qr = qrSvg(relayUrl);
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
  button { font: inherit; padding: .5rem 1rem; border-radius: .5rem; cursor: pointer; margin: 1rem 0 2rem; }
  svg { max-width: 100%; height: auto; border-radius: .5rem; }
</style>
<h1>Your relay URL</h1>
<p>Paste this into <b>Remote access &gt; Relay server</b> on your Android device.</p>
<code id="url">${relayUrl}</code>
<button id="copy">Copy</button>
${qr ? `<p>Or scan it with that device:</p>${qr}` : ""}
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
