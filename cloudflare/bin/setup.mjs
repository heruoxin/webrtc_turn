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
import { createInterface } from "node:readline/promises";

const wrangler = (args, input) =>
  spawnSync("npx", ["wrangler", ...args], { input, stdio: ["pipe", "inherit", "inherit"] });

console.log("Create a TURN key at https://dash.cloudflare.com/?to=/:account/realtime/turn");
console.log("Cloudflare shows the API token once, so copy both values before closing that page.\n");

const ask = createInterface({ input: process.stdin, output: process.stdout });
const TURN_KEY_ID = (await ask.question("TURN key id: ")).trim();
const TURN_KEY_API_TOKEN = (await ask.question("TURN key API token: ")).trim();
ask.close();

// The worker has to exist before it can hold secrets. Uploading them afterwards
// publishes a second version, which reopens the setup page for 30 minutes.
wrangler(["deploy"]);
wrangler(["secret", "bulk"], JSON.stringify({ TURN_KEY_ID, TURN_KEY_API_TOKEN }));

console.log("\nOpen the workers.dev address printed above to get your relay URL.");
