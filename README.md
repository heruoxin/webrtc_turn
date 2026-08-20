# webrtc_turn

[中文](README.zh-CN.md)

A relay server for AndroMeld, so your devices can still reach each other when
your network blocks a direct connection.

AndroMeld connects your phone, Mac, and browser directly whenever it can. Some
networks, such as mobile carriers and office Wi-Fi, refuse to let two devices
find each other. A relay server sits in the middle and passes the traffic
through. This project gives you two ways to run one, and both end with a single
URL that you paste into the app.

Your traffic is encrypted end to end. The relay forwards packets it cannot read.

## Pick one

| | Cloudflare | Docker |
|---|---|---|
| You need | A Cloudflare account | A Linux server and a domain name |
| Setup time | About 5 minutes | About 10 minutes |
| Cost | Free up to 1,000 GB per month, then $0.05 per GB | Whatever your server costs |
| Runs on | Cloudflare's global network | Your machine |

Cloudflare is the shorter path. Pick Docker if you already run a server, or if
you want the traffic to stay on hardware you control.

## Deploy on Cloudflare

### 1. Create a TURN key

Open [Realtime > TURN Keys](https://dash.cloudflare.com/?to=/:account/realtime/turn)
in your Cloudflare dashboard and select **Create**. Give it any name.

Cloudflare then shows a **key id** and an **API token**. Copy both now. The API
token is shown once and cannot be read again.

### 2. Invent an access token

This is the password that keeps strangers from using your relay. Any random
string works:

```
openssl rand -hex 16
```

### 3. Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heruoxin/webrtc_turn/tree/main/cloudflare)

Cloudflare copies this repository into your own GitHub account, then asks for
three values:

- `ACCESS_TOKEN`: the string from step 2
- `TURN_KEY_ID`: the key id from step 1
- `TURN_KEY_API_TOKEN`: the API token from step 1

Select **Deploy**. When it finishes, the dashboard shows the address of your
worker, something like `https://webrtc-turn.your-name.workers.dev`.

### 4. Build the URL

Add your access token to the address as a query parameter:

```
https://webrtc-turn.your-name.workers.dev/?token=YOUR_ACCESS_TOKEN
```

Skip to [paste it into the app](#paste-it-into-the-app).

### Deploying from a terminal instead

```
cd cloudflare
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler deploy
```

## Deploy with Docker

You need a Linux server with a public IP address. Host networking is required
for the relay, so Docker Desktop on macOS and Windows will not work.

### 1. Point a domain at the server

Create an A record, for example `turn.example.com`, pointing at the server's
public IP address. Certificates are issued automatically once DNS resolves.

### 2. Open the ports

| Port | Protocol | Used for |
|---|---|---|
| 80, 443 | TCP | The credential endpoint and its certificate |
| 3478 | TCP and UDP | Relay connections |
| 49160-49200 | UDP | Relayed traffic |

### 3. Fill in the settings

```
cd docker
cp .env.example .env
```

Open `.env` and set three values. The file explains each one, and the comments
include the commands that generate the two random secrets.

### 4. Start it

```
docker compose up -d
```

### 5. Build the URL

```
https://turn.example.com/?token=YOUR_ACCESS_TOKEN
```

### Turning on TURN over TLS

Relay traffic on port 3478 is visible as relay traffic, and a few strict
networks block it. Port 5349 wraps the same traffic in TLS, which usually gets
through.

It is off by default because coturn needs a certificate on disk and reads it
only at startup. To turn it on, give coturn a certificate for your domain, drop
`--no-tls` from `docker-compose.yml`, add `--tls-listening-port=5349` along with
`--cert` and `--pkey`, and append this to `TURN_URLS` in `.env`:

```
turns:${PUBLIC_HOST}:5349?transport=tcp
```

Restart coturn after the certificate renews.

## Paste it into the app

On your Android device, open **Remote access > Relay server**, paste the whole
URL, and save. The app checks the URL right away and tells you if something is
wrong. Your Mac and browser pick up the setting on their own.

Nothing changes for connections that already work. The relay is used only when
a direct connection fails.

## What the endpoint returns

A `GET` on the URL returns short-lived credentials:

```json
{
  "iceServers": [
    {
      "urls": ["turn:turn.example.com:3478?transport=udp"],
      "username": "1787332426:2d81ab8fe31fe13b",
      "credential": "YjHN93xmrXKuN2JnPIl1mcWgBXc="
    }
  ],
  "ttl": 86400
}
```

Credentials last 24 hours and are issued fresh on every request. A wrong token
returns 401, and any other path returns 404.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
