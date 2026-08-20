# webrtc_turn

[中文](README.zh-CN.md)

A relay server for AndroMeld, so your devices can still reach each other when
the network blocks a direct connection.

AndroMeld connects your phone, Mac, and browser directly whenever it can. Some
networks, such as mobile carriers and office Wi-Fi, refuse to let two devices
find each other. A relay server sits in the middle and passes the traffic
through. This project gives you two ways to run one, and both end with a single
URL that you paste into the app.

Your traffic stays encrypted end to end. The relay forwards packets it cannot
read.

## Pick one

| | Cloudflare | Docker |
|---|---|---|
| You need | A Cloudflare account, and most likely a payment method | A Linux server with a public IP address, and a domain name |
| Runs on | Cloudflare's global network | Your machine |
| Cost | Nothing for the first 1,000 GB each month, then $0.05 per GB | Whatever your server costs |
| Setup | Browser only, about 5 minutes | One command, about 10 minutes |

### About the payment method

Cloudflare Realtime, the service behind the Cloudflare option, is a paid
product with a free allowance. Several people have reported that the dashboard
asks for a credit card before it will hand out TURN credentials, and a
Cloudflare community moderator confirmed it in the same thread. Cloudflare's own
documentation does not say either way, so treat this as likely rather than
certain.

What is documented: the first 1,000 GB of relayed traffic each month is free,
and traffic beyond that costs $0.05 per GB. Only data that actually goes through
the relay counts, so a month where every connection succeeds directly costs
nothing. You do not need the paid Workers plan.

If you would rather not hand over a card, use the Docker option. It needs a
Linux server with a public IP address instead.

## Deploy on Cloudflare

### 1. Create a TURN key

Open [Realtime > TURN Keys](https://dash.cloudflare.com/?to=/:account/realtime/turn)
and select **Create**. Any name works.

Cloudflare then shows a **key id** and an **API token**. Copy both into a note
before you close that page. The API token is shown once and cannot be read
again.

### 2. Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heruoxin/webrtc_turn/tree/main/cloudflare)

Cloudflare copies this repository into your GitHub account and builds it from
there. That is how its deploy button works, and it is why the button asks for
GitHub access. The code it copies is the code in this repository.

The setup page asks for the two values from step 1, then deploys. Accept the
repository and worker names it suggests.

### 3. Get your URL

Open the `workers.dev` address the dashboard shows. The worker greets you with
your finished relay URL, a copy button, and a QR code you can scan with your
phone.

That page stays open for 30 minutes after each deployment, then returns 404. To
open it again, redeploy from **Workers & Pages > your worker > Deployments**.

The URL contains a token derived from your API token. It stays the same across
redeployments, so a URL you already saved keeps working.

## Deploy with Docker

You need a Linux server with a public IP address. The relay needs host
networking, so Docker Desktop on macOS and Windows will not work.

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

Relay traffic on port 3478 is recognizable as relay traffic, and a few strict
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

The URL contains your private token. Anyone who has it can send traffic through
your relay, so keep it to yourself.

## Deploying from a terminal

If you already have Node and a terminal, this skips the GitHub copy entirely:

```
git clone https://github.com/heruoxin/webrtc_turn
cd webrtc_turn/cloudflare
npm install
npm run setup
```

The script asks for the TURN key id and API token, deploys, and prints the
worker address. Open it to get your relay URL.

To choose your own token instead of the derived one, set it and redeploy:

```
npx wrangler secret put ACCESS_TOKEN
```

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
