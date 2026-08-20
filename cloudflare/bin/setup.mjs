#!/usr/bin/env node
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

import { spawnSync } from "node:child_process";

// shell: true is what makes this work on Windows, where npx is npx.cmd and Node
// will not resolve it otherwise.
const wrangler = (args) => {
  const { status, error } = spawnSync("npx", ["wrangler", ...args], { stdio: "inherit", shell: true });
  if (error || status !== 0) process.exit(status ?? 1);
};

console.log("Create a TURN key at https://dash.cloudflare.com/?to=/:account/realtime/turn");
console.log("Cloudflare shows the API token once, so copy both values before closing that page.\n");

// The worker has to exist before it can hold secrets. Each secret upload then
// publishes a new version, which reopens the setup page for 30 minutes.
// Wrangler does the asking, so the API token never echoes into the scrollback.
wrangler(["deploy"]);
wrangler(["secret", "put", "TURN_KEY_ID"]);
wrangler(["secret", "put", "TURN_KEY_API_TOKEN"]);

console.log("\nOpen the workers.dev address printed above to get your relay URL.");
