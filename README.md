# RecWorld 0.2

An original, browser-based 3D social multiplayer prototype. It is inspired by the broad idea of a colorful social VR hangout, but uses its own name, code, UI, world, and placeholder art.

## Included
- 3D low-poly social plaza
- First-person and third-person camera toggle
- PC keyboard movement and mobile touch movement
- Jumping and simple walk animation
- Live multiplayer presence and movement through Socket.IO
- Room switching (Plaza and Chill Lounge)
- Live text chat
- Name and avatar-color customization
- Shared object placement (early Maker tool)
- Loading screen, wrist-menu-style UI, room list, settings

## Run locally
Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

For testing with another device on the same Wi-Fi, open `http://YOUR-COMPUTER-LAN-IP:3000` on that device.

## Deploy online
1. Upload this project to a GitHub repository.
2. Create a new Web Service on a Node hosting provider such as Render.
3. Build command: `npm install`
4. Start command: `npm start`
5. The service uses the hosting provider's `PORT` environment variable automatically.
6. Open the deployed HTTPS address on Android or PC.

## Important prototype notes
- This is a playable foundation, not a complete Rec Room-sized game.
- Multiplayer currently synchronizes player positions, chat, room membership, and simple placed objects. It does not yet include persistent accounts, voice chat, friend lists, moderation tools, VR headset input, or a finished Maker Pen.
- Player state and placed objects are kept in server memory and reset when the server restarts.
- Three.js is loaded from a public CDN, so the first launch requires an internet connection.
- Do not use real passwords or sensitive personal information in this prototype; it does not implement secure account authentication.
