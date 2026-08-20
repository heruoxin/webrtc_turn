# webrtc_turn

[English](README.md)

给 AndroMeld 用的中转服务器。网络挡住设备直连时，靠它把流量转过去。

AndroMeld 会优先让手机、Mac 和浏览器直连。有些网络不允许两台设备互相找到对方，
比如移动网络和公司 Wi-Fi。中转服务器夹在中间，替它们传递流量。这个项目提供两种
部署方式，最后都会得到一条 URL，粘贴进 App 就行。

流量保持端到端加密，中转服务器转发的内容它自己读不了。

## 选一种

| | Cloudflare | Docker |
|---|---|---|
| 需要准备 | 一个 Cloudflare 账号，多半还要一张银行卡 | 一台有公网 IP 的 Linux 服务器和一个域名 |
| 运行在 | Cloudflare 的全球网络 | 你自己的机器 |
| 费用 | 每月前 1,000 GB 免费，超出后每 GB 0.05 美元 | 服务器本身的费用 |
| 部署方式 | 全程在浏览器里，约 5 分钟 | 一条命令，约 10 分钟 |

### 关于绑卡

Cloudflare 这条路底下是 Cloudflare Realtime，它是一个「有免费额度的付费产品」。
有用户反馈控制台要先填信用卡才会发 TURN 凭据，同一个帖子里 Cloudflare 社区版主也
确认了这一点。Cloudflare 官方文档没有明说，所以这只是大概率，不是定论。

文档写明的部分是：每月前 1,000 GB 中转流量免费，超出部分每 GB 0.05 美元。只有真正
走了中转的流量才计费，所以一个月里全部直连成功的话就是零费用。不需要升级 Workers
付费计划。

不想给卡号就走 Docker 那条路，代价是你得有一台带公网 IP 的 Linux 服务器。

## 部署到 Cloudflare

### 1. 创建 TURN key

打开 [Realtime > TURN Keys](https://dash.cloudflare.com/?to=/:account/realtime/turn)，
点 **Create**，名字随便取。

Cloudflare 会显示一个 **key id** 和一个 **API token**。关掉这个页面之前，先把两个值
都复制到记事本里。API token 只显示这一次，之后看不到了。

### 2. 部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heruoxin/webrtc_turn/tree/main/cloudflare)

Cloudflare 会把这个仓库复制到你的 GitHub 账号下，再从那里构建。这是它的部署按钮的
工作方式，也是它要 GitHub 授权的原因。它复制走的就是这个仓库里的代码。

配置页会问你第 1 步的那两个值，填完就能部署。仓库名和 Worker 名按它给的默认值就行。

### 3. 拿到 URL

打开控制台显示的 `workers.dev` 地址。Worker 会把拼好的中转 URL 展示给你，旁边有复制
按钮和一个二维码，用手机扫一下就行。

这个页面在每次部署后开放 30 分钟，之后返回 404。想再打开，就从 **Workers & Pages >
你的 Worker > Deployments** 重新部署一次。

URL 里的 token 是从 API token 派生出来的，重新部署也不会变，已经保存的 URL 不会失效。

## 用 Docker 部署

需要一台有公网 IP 的 Linux 服务器。中转依赖 host 网络模式，所以 macOS 和 Windows 上
的 Docker Desktop 用不了。

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

URL 里带着你的私密 token。拿到它的人都能占用你的中转服务器，所以别公开分享。

## 用命令行部署

如果你本来就有 Node 和终端，这条路可以完全跳过 GitHub 复制那一步：

```
git clone https://github.com/heruoxin/webrtc_turn
cd webrtc_turn/cloudflare
npm install
npm run setup
```

脚本会问 TURN key id 和 API token，然后部署并打印 Worker 地址。打开它就能拿到中转 URL。

想自己指定 token 而不用派生的那个，设好再重新部署：

```
npx wrangler secret put ACCESS_TOKEN
```

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
