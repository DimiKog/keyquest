# CipherBoard — deploy runbook (Ubuntu 22.04, new VM)

Pattern for every app on this VM: own dir under /opt/<app>, systemd unit with DynamicUser + hardening,
listens on 127.0.0.1:<port> only, own nginx server block + subdomain. Only 22/80/443 open.

1. Base: `sudo apt update && sudo apt full-upgrade -y && sudo apt install -y nginx certbot python3-certbot-nginx ufw fail2ban unattended-upgrades curl`
2. Firewall: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`
3. Node 20 LTS (NodeSource): `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`
4. App: `sudo mkdir -p /opt/cipherboard` ; copy board-server.js there (scp to home, then sudo mv).
5. Secrets: `echo "ADMIN_TOKEN=$(openssl rand -hex 16)" | sudo tee /etc/cipherboard.env` and add `ALLOW_ORIGIN=https://<where the page is hosted>`; `sudo chmod 600 /etc/cipherboard.env`
6. Service: install deploy/cipherboard.service to /etc/systemd/system/, then `sudo systemctl daemon-reload && sudo systemctl enable --now cipherboard`; check `curl -s 127.0.0.1:8787/health`
7. DNS: A record BOARD_DOMAIN → VM IP (wait until it resolves).
8. nginx: install deploy/cipherboard.nginx.conf as /etc/nginx/sites-available/cipherboard (fix BOARD_DOMAIN), symlink into sites-enabled, `sudo nginx -t && sudo systemctl reload nginx`
9. TLS: `sudo certbot --nginx -d BOARD_DOMAIN`
10. Verify: `curl -s https://BOARD_DOMAIN/health`; set BOARD_URL_DEFAULT in cipherboard.html to https://BOARD_DOMAIN and publish the page.
Clear the board: `curl -X POST https://BOARD_DOMAIN/admin/clear -H "x-admin-token: <token>"`
