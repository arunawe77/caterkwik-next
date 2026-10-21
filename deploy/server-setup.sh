#!/bin/sh
# One-time server preparation for the CI/CD pipeline. Run as root on the server:
#
#   MEDIA_SFTP_PASSWORD='<media storage password>' sh server-setup.sh
#
# It creates a 'deploy' user that can only log in with the pipeline's key, hands it the install folder, and makes sure
# .env carries the media storage settings. Safe to run again. Nothing is restarted.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
APP_DIR="${APP_DIR:-/opt/caterkwick/caterkwik-next}"
[ -f "$APP_DIR/docker-compose.yml" ] || { echo "$APP_DIR has no docker-compose.yml" >&2; exit 1; }
PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN8CR5Iautkxg0brUL/l7Y9lT7o8MUzwjkXpZXhD2Nlv github-actions-deploy@caterkwik'

# a snapshot of what is there now, in case the first deploy replaces something that mattered
SNAP="$(dirname "$APP_DIR")/folder-before-cicd-$(date +%Y%m%d-%H%M%S).tar.gz"
tar czf "$SNAP" --exclude=node_modules --exclude=.next -C "$APP_DIR" .
echo "snapshot: $SNAP"

command -v rsync >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq rsync; }
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "Caterkwik deploys" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf '%s\n' "no-agent-forwarding,no-port-forwarding,no-X11-forwarding $PUBKEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy "$APP_DIR"
install -d -o deploy -g deploy "$(dirname "$APP_DIR")/backups"

# media storage settings (the host key is read from this machine; the password only from the environment)
if ! grep -q '^MEDIA_SFTP_PASSWORD=' "$APP_DIR/.env"; then
  : "${MEDIA_SFTP_PASSWORD:?set MEDIA_SFTP_PASSWORD}"
  FP=$(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}')
  {
    echo ""
    echo "# Media storage (product images and PDFs), over SFTP."
    echo "MEDIA_SFTP_HOST=${MEDIA_SFTP_HOST:-178.128.174.180}"
    echo "MEDIA_SFTP_PORT=22"
    echo "MEDIA_SFTP_USER=${MEDIA_SFTP_USER:-colleague}"
    echo "MEDIA_SFTP_PASSWORD=$MEDIA_SFTP_PASSWORD"
    echo "MEDIA_REMOTE_DIR=/mnt/media"
    echo "MEDIA_SFTP_HOST_FINGERPRINT=$FP"
  } >> "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  chown deploy:deploy "$APP_DIR/.env"
fi
echo "server ready for the pipeline"
