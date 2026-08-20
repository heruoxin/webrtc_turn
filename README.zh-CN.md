# webrtc_turn

[English](README.md)

给 AndroMeld 用的中转服务器。网络挡住设备直连时，靠它把流量转过去。

AndroMeld 会优先让手机、Mac 和浏览器直连。有些网络不允许两台设备互相找到对方，
比如移动网络和公司 Wi-Fi。中转服务器夹在中间，替它们传递流量。这个项目提供两种
部署方式，最后都会得到一条 URL，粘贴进 App 就行。

流量是端到端加密的，中转服务器转发的内容它自己读不了。

## 选一种

| | Cloudflare | Docker |
|---|---|---|
| 需要准备 | 一个 Cloudflare 账号 | 一台 Linux 服务器和一个域名 |
| 大概耗时 | 5 分钟 | 10 分钟 |
| 费用 | 每月 1,000 GB 以内免费，超出后每 GB 0.05 美元 | 服务器本身的费用 |
| 运行在 | Cloudflare 的全球网络 | 你自己的机器 |

Cloudflare 这条路更短。如果你本来就有服务器，或者希望流量只经过自己掌控的硬件，
就选 Docker。

## 部署到 Cloudflare

### 1. 创建 TURN key

在 Cloudflare 控制台打开
[Realtime > TURN Keys](https://dash.cloudflare.com/?to=/:account/realtime/turn)，
点 **Create**，名字随便取。

Cloudflare 会显示一个 **key id** 和一个 **API token**，两个都立刻复制下来。
API token 只显示这一次，之后看不到了。

### 2. 想一个访问口令

这是拦住陌生人使用你的中转服务器的密码，随机字符串就行：

```
openssl rand -hex 16
```

### 3. 部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heruoxin/webrtc_turn/tree/main/cloudflare)

Cloudflare 会把这个仓库复制到你自己的 GitHub 账号下，然后问你三个值：

- `ACCESS_TOKEN`：第 2 步的字符串
- `TURN_KEY_ID`：第 1 步的 key id
- `TURN_KEY_API_TOKEN`：第 1 步的 API token

点 **Deploy**。部署完成后，控制台会显示 Worker 的地址，形如
`https://webrtc-turn.your-name.workers.dev`。

### 4. 拼出 URL

把访问口令作为 query 参数接在地址后面：

```
https://webrtc-turn.your-name.workers.dev/?token=你的访问口令
```

接着看[粘贴进 App](#粘贴进-app)。

### 改用命令行部署

```
cd cloudflare
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npx wrangler deploy
```

## 用 Docker 部署

需要一台有公网 IP 的 Linux 服务器。中转依赖 host 网络模式，所以 macOS 和 Windows
上的 Docker Desktop 用不了。

### 1. 把域名指向服务器

加一条 A 记录，比如 `turn.example.com`，指向服务器的公网 IP。DNS 生效后证书会自动
签发。

### 2. 放行端口

| 端口 | 协议 | 用途 |
|---|---|---|
| 80、443 | TCP | 凭据接口和它的证书 |
| 3478 | TCP 和 UDP | 中转连接 |
| 49160-49200 | UDP | 被中转的流量 |

### 3. 填配置

```
cd docker
cp .env.example .env
```

打开 `.env` 填三个值。文件里对每一项都有说明，两个随机密钥的生成命令也写在注释里。

### 4. 启动

```
docker compose up -d
```

### 5. 拼出 URL

```
https://turn.example.com/?token=你的访问口令
```

### 开启 TURN over TLS

3478 端口上的流量一眼就能看出是中转流量，少数严格的网络会把它拦掉。5349 端口把同样
的流量套一层 TLS，通常能过。

默认不开，因为 coturn 需要磁盘上的证书文件，而且只在启动时读一次。要开启的话：给
coturn 准备一份你域名的证书，从 `docker-compose.yml` 里去掉 `--no-tls`，加上
`--tls-listening-port=5349` 以及 `--cert` 和 `--pkey`，再把这一条追加到 `.env` 的
`TURN_URLS` 里：

```
turns:${PUBLIC_HOST}:5349?transport=tcp
```

证书续期后记得重启 coturn。

## 粘贴进 App

在 Android 上打开 **远程访问 > 中转服务器**，把整条 URL 粘进去保存。App 会当场检查
这条 URL，有问题会告诉你。Mac 和浏览器会自己同步到这个设置。

已经能连上的连接不受影响，只有直连失败时才会走中转。

## 接口返回什么

对这条 URL 发 `GET`，拿到的是短期凭据：

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

凭据有效期 24 小时，每次请求都重新签发。token 不对返回 401，其他路径返回 404。

## 许可证

GPL-3.0-or-later，见 [LICENSE](LICENSE)。
