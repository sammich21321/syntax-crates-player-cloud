# Syntax Crates Player Cloud

This server lets players on different networks see each other in the Players tab.

## What You Need

- A hosted Node.js web service that stays on.
- The public URL from that host.
- The same URL saved in every player's game settings.

## Always-On Setup

Use an always-on paid web service. Free web services may sleep or turn off after inactivity.

Recommended settings:

- Build command: `npm install`
- Start command: `npm run cloud-server`
- Health check path: `/health`
- Persistent data file: set `SYNTAX_CLOUD_STORE` to a persistent path, for example `/var/data/cloud-players.json`

This folder includes `render.yaml` for Render Blueprint deployment and a `Procfile` for hosts that detect Procfile apps.

## After Hosting

1. Copy the public URL from the host.
2. Open Syntax Crates.
3. Go to `Settings`.
4. Paste the URL into `Player Cloud`.
5. Click `[ SAVE CLOUD URL ]`.
6. Click `[ PUBLISH PROFILE ]`.

Every player must use the same URL.
