# SignedLedger — deploy on the existing CipherBoard VM (no new DNS, no new certificate)

The ledger runs as a second hardened service on the same VM and is reached at
`https://learnencrypt.dimikog.org/ledger/` (path prefix on the existing nginx + Let's Encrypt site).
`cipherboard.html` talks to `/` , `ledger.html` talks to `/ledger/` — they do not interfere.

## 1. Copy the two server files (from the Mac, in the KeyQuest folder)
    scp ledger-server.js ledger-crypto.js USER@VM:/tmp/

## 2. On the VM
    sudo mkdir -p /opt/signedledger
    sudo mv /tmp/ledger-server.js /tmp/ledger-crypto.js /opt/signedledger/
    sudo sh -c 'printf "ADMIN_TOKEN=%s\nALLOW_ORIGIN=https://dimikog.github.io\n" "$(openssl rand -hex 16)" > /etc/signedledger.env'
    sudo chmod 600 /etc/signedledger.env
    sudo cat /etc/signedledger.env        # note the ADMIN_TOKEN (to reset the ledger between classes)

## 3. systemd unit (deploy/signedledger.service)
    sudo cp signedledger.service /etc/systemd/system/    # or paste the file contents
    sudo systemctl daemon-reload && sudo systemctl enable --now signedledger
    curl -s http://127.0.0.1:8788/health                  # → {"ok":true,"accts":0,"txs":0}

## 4. nginx: add the block from deploy/signedledger.nginx.location
Edit `/etc/nginx/sites-available/cipherboard`, paste the `location /ledger/ {…}` block inside the server block
(above `location / {`), then:
    sudo nginx -t && sudo systemctl reload nginx
    curl -s https://learnencrypt.dimikog.org/ledger/health

## Reset between classes
    curl -X POST -H "x-admin-token: TOKEN" https://learnencrypt.dimikog.org/ledger/admin/clear
