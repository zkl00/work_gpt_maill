# 账号到期提醒

这是一个部署到 Cloudflare Workers 的账号到期提醒工具：账号数据保存在 D1，Cloudflare Cron 每天按 `Asia/Shanghai` 时区的 09:00 检查到期账号，邮件由 Resend API 发送。QQ、163、Gmail 都可以作为接收邮箱。

## 首次部署到 Cloudflare

1. 安装依赖并登录 Cloudflare：

   ```bash
   npm install
   npx wrangler login
   ```

2. 创建 D1 数据库：

   ```bash
   npx wrangler d1 create expiry-email-reminders
   ```

   把命令输出的 `database_id` 填入 [wrangler.jsonc](./wrangler.jsonc) 的 `database_id`。不要提交任何密钥。

3. 创建表结构：

   ```bash
   npm run db:migrate:remote
   ```

4. 设置必要密钥。页面上保存 Resend 配置时必须先设置加密密钥：

   ```bash
   openssl rand -base64 32
   npx wrangler secret put EMAIL_CONFIG_ENCRYPTION_KEY
   npx wrangler secret put TYPESAFE_API_KEY
   ```

   第二个是可选的；未设置时，备注仍会按页面选择的提醒天数处理。也可以不用页面设置邮件，而改为设置 `RESEND_API_KEY` 和 `EMAIL_FROM` 两个 Worker Secret。

5. 发布：

   ```bash
   npm run deploy
   ```

   发布后打开 Wrangler 输出的 `workers.dev` 地址，在“邮件发送设置”填写 Resend API Key 和已验证域名的发件人，然后用“立即测试”验证投递。

`wrangler.jsonc` 中的 `0 1 * * *` 是 UTC 01:00，即中国时区每天 09:00。Cron 会直接运行 Worker，不需要配置 `CRON_SECRET`；它只保留给手动调用 `/api/cron/send-reminders` 时使用。

## 迁移现有本地数据

本地 JSON 数据不会自动上传到 Cloudflare。部署前运行：

```bash
npm run export:legacy-data
```

它会在 `data/subscriptions-cloudflare-import.xlsx` 创建一份可导入 Excel。发布后打开网页的“导入账号”，选择该文件、确认预览，再导入到 D1。旧的 `data/subscriptions.json` 不会被修改或提交到 Git。

## 本地验证 Workers 版本

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填写 EMAIL_CONFIG_ENCRYPTION_KEY
npm run db:migrate:local
npm run preview
```

本地预览运行在 `http://localhost:8787`。Cron 可以用下面的命令手动触发：

```bash
curl "http://localhost:8787/cdn-cgi/local/scheduled?format=json"
```

## 安全提示

当前项目没有登录功能。部署到公开域名以前，请为该 Worker 设置 Cloudflare Access，只允许你自己的邮箱登录；否则任何知道网址的人都可能查看、修改账号资料或邮件配置。
