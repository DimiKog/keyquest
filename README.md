# KeyQuest & CipherBoard

Two small teaching tools for blockchain cryptography, no dependencies, real crypto in the browser.

- **KeyQuest** (`keyquest.html`) — 4-level game: hashing/mining, key generation, signing, the heist.
- **CipherBoard** (`cipherboard.html`) — public board of encrypted, signed messages (ECIES secp256k1 + AES-256-GCM).
- `board-server.js` — zero-dependency Node server that stores only public keys and ciphertext.
- `deploy/` — systemd unit, nginx config and runbook.

Educational use only. Don't use the generated keys for real funds, and don't post secrets on the public board.
