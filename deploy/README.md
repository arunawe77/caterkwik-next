# Deployment runbook

Target: `caterkwik.awecreative.co.uk` on one DigitalOcean droplet, behind a password, never indexed.
The site and its Postgres run in Docker Compose; nginx on the host terminates TLS.

**Not yet run on a real droplet.** The Docker image could not be built on the machine this was written on
(no Docker), so the first deploy is the first real test of `Dockerfile`, `docker-compose.yml` and
`release.sh`. Fix this document where it is wrong.

## 1. What you need

| Need | From |
|---|---|
| A droplet: Ubuntu 24.04 LTS, 2 GB RAM or more | Awe DigitalOcean |
| A Cloudflare A record `caterkwik` to its IP, **DNS only (grey cloud)** | Lee. Grey cloud, because certbot validates over HTTP. |
| A staging password | Lee |
| An Anthropic API key (Kit), an SMTP login (email), Stripe keys (cards) | Lee. Each is optional: without it the feature degrades safely (Kit says "not configured", mail goes to the log, orders are taken for payment by the team). |
| GitHub secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and variable `STAGING_URL` | You, in the repo's `staging` environment |

## 2. One-off server setup

```bash
apt update && apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git curl ufw
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

git clone https://github.com/Awecreative/caterkwick.git /opt/caterkwick
cd /opt/caterkwick && git checkout develop
cd caterkwik-next
cp .env.example .env && nano .env      # SITE_URL, SITE_PASSWORD, DB_PASSWORD, and any keys
```

`DB_PASSWORD` is the Postgres password; pick a long random one. `.env` stays on the server and is never committed.

## 3. First release

```bash
./deploy/release.sh
curl -s "http://127.0.0.1:3000/api/health?db=1"     # ok
```

The app container applies database migrations on start. If a migration fails the container stops, the previous
release keeps running, and `release.sh` rolls back.

## 4. nginx and TLS

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/caterkwik
ln -s /etc/nginx/sites-available/caterkwik /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d caterkwik.awecreative.co.uk
```

## 5. The first admin

Register on the site, then promote that account:

```bash
docker compose exec app node scripts/make-admin.mjs you@caterkwik.co.uk
```

The admin is at `/admin`: orders, quotes and enquiries, redirects, users.

## 6. Stripe (when Lee has keys)

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env`, restart (`docker compose up -d`), and in the Stripe
dashboard point a webhook at `https://caterkwik.awecreative.co.uk/api/stripe/webhook` for
`checkout.session.completed` and `checkout.session.expired`. The webhook path is open through the staging password,
because Stripe has no cookie; it is protected by its signature instead.

## 7. Check it

```bash
curl -sI https://caterkwik.awecreative.co.uk/ | grep -i "location\|x-robots"   # 307 to /gate
curl -s  https://caterkwik.awecreative.co.uk/robots.txt                         # Disallow: /
node scripts/redirect-report.mjs https://caterkwik.awecreative.co.uk            # 100%
```

Old addresses are deliberately reachable without the password, so a link in an old email still lands.

## 8. Releasing a change

Push to `develop`. The GitHub workflow (`.github/workflows/ci-cd.yml`) type-checks, lints, runs the tests against a
real Postgres, builds, then SSHes in and runs `deploy/release.sh`, then smoke-tests the live site. By hand:

```bash
cd /opt/caterkwick && git pull && cd caterkwik-next && ./deploy/release.sh
```

Pages are pre-rendered at build time from `src/data/`, so a catalogue change needs a release.

## 9. Backups

Orders and accounts live only in Postgres. Nightly, kept 14 days:

```bash
crontab -e     # 0 2 * * *  cd /opt/caterkwick/caterkwik-next && ./deploy/backup.sh
```

Restore: `gunzip -c backup.sql.gz | docker compose exec -T db psql -U caterkwik caterkwik`.

## Competitor price checks

Set `CRON_SECRET` in `.env` (`openssl rand -hex 32`), then schedule the nightly run:

```bash
crontab -e     # 0 3 * * *  cd /opt/caterkwick/caterkwik-next && ./deploy/competitor-check.sh
```

Staff can also press "Check now" on /admin/competitors. Only sites listed in `AUTO_SITES` are checked automatically.

## 10. Going to production

Production goes in Caterkwik's own cloud account, not Awe's. Same steps, with `SITE_URL` set to the real domain and
`ALLOW_INDEXING=true` in `.env`, which opens `robots.txt`, the robots meta tag and the indexing header together.
Remove `SITE_PASSWORD` to take the gate off.
