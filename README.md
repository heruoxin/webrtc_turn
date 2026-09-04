# webrtc_turn

[English](README.md) · [中文](README.zh-CN.md)

A self-hosted WebRTC TURN relay server for [AndroMeld](https://andromeld.catchingnow.com/).

AndroMeld connects your phone, Mac, and browser directly via P2P whenever possible. However, some restrictive network environments (such as cellular data, corporate/campus Wi-Fi, or symmetric NATs) prevent direct peer-to-peer connections. A TURN relay server bridges the gap by relaying encrypted traffic when direct connections fail.

- **End-to-End Encrypted**: The relay only forwards encrypted packets and cannot inspect your data.
- **On-Demand Fallback**: Normal direct connections remain unchanged. The relay is only engaged when P2P fails.

---

## Choose an Option

| | Cloudflare Workers (Recommended) | Docker (Self-Hosted) |
|---|---|---|
| **Requirements** | Cloudflare account * | Linux VPS with public IPv4 + Domain name |
| **Runs on** | Cloudflare global edge network | Your own server |
| **Cost** | Free for first 1,000 GB/month | Server cost only |

\* Cloudflare requires a payment method. The first 1,000 GB of traffic each month is free, $0.05/GB thereafter.

---

## Option 1: Deploy on Cloudflare (Recommended)

### 1. Create a TURN Key
1. Go to [Realtime > TURN Keys](https://dash.cloudflare.com/?to=/:account/realtime/turn) in your Cloudflare dashboard.
2. Click **Create** (any name works).
3. Cloudflare will display a **Key ID** and an **API Token**. **Copy both immediately** (the API token is only shown once).

### 2. Deploy the Worker
Click the button below to deploy to Cloudflare (this will request GitHub authorization to automatically fork and build this repository):

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heruoxin/webrtc_turn/tree/main/cloudflare)

Enter the **Key ID** and **API Token** from step 1 when prompted, then finish the deployment.

<details>
<summary><b>Deploy from the command line (optional)</b></summary>

If you prefer a terminal, you can also deploy locally:
```bash
git clone https://github.com/heruoxin/webrtc_turn
cd webrtc_turn/cloudflare
npm install
npm run setup
```
</details>

### 3. Get Your Relay URL
Once deployed, paste the assigned `*.workers.dev` URL into your AndroMeld Android client, under **Remote access > Relay server**.
- For security, the setup page is only served for **30 minutes** after a deployment (returns 404 afterward). Redeploy from your Cloudflare dashboard to open it again.

<img src="docs/relay-server.png" alt="Relay server field under Remote access in the Android client" width="360">

---

## Option 2: Deploy with Docker

Requires a Linux server with a public IP. (Docker Desktop on macOS/Windows is not supported because coturn requires `network_mode: host`.)

### 1. Point a Domain at Your Server
Add an A record (e.g., `turn.example.com`) pointing to your server's public IP. The bundled Caddy instance automatically obtains and renews SSL certificates.

> **Note**: AndroMeld clients support `https://` only.

### 2. Open Firewall Ports
Ensure the following ports are open on your server firewall / cloud security group:

| Port | Protocol | Purpose |
|---|---|---|
| `80`, `443` | TCP | Credential API endpoint & SSL certificate issuance |
| `3478` | TCP & UDP | TURN relay control connections |
| `49160-49200` | UDP | TURN relayed traffic port range |

### 3. Configure and Run
```bash
cd docker
cp .env.example .env
```
Open `.env` and fill in the values (commands to generate random secrets are included in the file comments):
- `PUBLIC_HOST`: Your domain name (e.g., `turn.example.com`)
- `ACCESS_TOKEN`: A secret access token for your endpoint
- `TURN_STATIC_SECRET`: A shared static secret for coturn authentication

Start the containers:
```bash
docker compose up -d
```

### 4. Your Relay URL
Your relay URL is ready at:
```text
https://turn.example.com/?token=YOUR_ACCESS_TOKEN
```

<details>
<summary><b>Advanced: Enabling TURN over TLS (Port 5349)</b></summary>

Relay traffic on port 3478 is unencrypted at the transport level and may be blocked by strict firewalls. Port 5349 wraps TURN traffic in TLS:
1. Provide valid SSL certificates on disk for coturn.
2. In `docker-compose.yml`, remove `--no-tls` and add `--tls-listening-port=5349`, `--cert`, and `--pkey`.
3. Append `turns:${PUBLIC_HOST}:5349?transport=tcp` to `TURN_URLS` in `.env`.
4. Remember to restart coturn when certificates renew.
</details>

### 5. Configure in AndroMeld
Paste your relay URL into your AndroMeld Android client, under **Remote access > Relay server**.

<img src="docs/relay-server.png" alt="Relay server field under Remote access in the Android client" width="360">

---

## API Specification

Sending a `GET` request to your relay URL returns temporary ICE credentials valid for 24 hours:

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

- Invalid token returns `401 Unauthorized`.
- Any other path returns `404 Not Found`.

---

## License

[GPL-3.0-or-later](LICENSE)
