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

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const text = (body, status) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

// Digesting first makes the comparison independent of the length of the
// supplied token, which timingSafeEqual would otherwise leak.
async function tokenMatches(supplied, expected) {
  const digest = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return crypto.subtle.timingSafeEqual(await digest(supplied), await digest(expected));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/") {
      return text("Not found", 404);
    }

    if (!(await tokenMatches(url.searchParams.get("token") ?? "", env.ACCESS_TOKEN))) {
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
