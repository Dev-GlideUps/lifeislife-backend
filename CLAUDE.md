# CLAUDE.md — LifeIsLive Backend

## What this is

Node.js/Express + Socket.IO + MongoDB backend for **LifeIsLive**, a
live-streaming and short-video social app with a coin economy (gifts, calls,
PK battles, audio rooms, store items, hosts/agencies, payouts, payment
gateways, third-party games). It serves a Flutter app (`/api/client`,
`/api/agency`, `/api/host`, sockets) and a Next.js admin panel (`/api/admin`).
Plain CommonJS, no TypeScript, no build step, no test suite.

## Read these

- [docs/project-overview.md](docs/project-overview.md) — product, architecture, data flows, local setup (start here)
- [docs/pk-battle.md](docs/pk-battle.md) — PK battle module: state, socket events, money flow, known gaps
- [DEPLOYMENT.md](DEPLOYMENT.md) — production runbook (Droplet, PM2, Nginx, Docker Mongo/Redis)
- [tencent-backend-requirements.md](tencent-backend-requirements.md) — rules for the Agora → Tencent migration
- [setting.example.js](setting.example.js) — shape of the runtime `Setting` document

## Commands

```bash
npm install                 # deps (Node 22)
node seed.js                # optional seed: admin@lifeislive.net / admin123, gifts, levels, coin plans
npm start                   # nodemon index.js  (reads .env; needs Mongo + Redis running)
npm test                    # no tests exist — this is the npm stub and exits 1
```

`.env` needs at least `PORT`, `MongoDb_Connection_String`, `secretKey`,
`baseURL`; Redis defaults to localhost. Firebase service account goes in
`util/firebase.json` (untracked) or `Setting.privateKey`, otherwise auth
middleware exits at startup.

## Where things are

| Need | Look in |
|---|---|
| Bootstrap, cron, game-provider callbacks | `index.js` |
| All socket events (chat, live, audio seats, PK, calls, gifts) | `socket.js` (one big file; search `socket.on("<event>"`) |
| URL → handler | `routes/<area>/route.js` → `routes/<area>/<feature>.route.js` → `controllers/<area>/<feature>.controller.js` |
| Schemas | `models/*.model.js` (`user`, `liveStreamer`, `liveStreamerHistory`, `history` = wallet ledger, `setting`, `agency`, `payoutRequest`) |
| Enums (history types, roles, login types…) | `types/constant.js` |
| Auth middleware | `middleware/` (`validateUserToken`, `verifyAdminAuthToken`, `checkPermission`) and `checkAccess.js` (secret key) |
| Runtime settings load / Tencent UserSig / levels / uploads | `util/initializeSettings.js`, `util/tencentUserSig.js`, `util/updateHostLevel.js`, `util/updateWealthLevel.js`, `util/multer.js` |

## Conventions and rules

- **Response shape**: `res.status(200).json({ status: true|false, message, data })`.
  Business errors are HTTP 200 with `status:false`; only exceptions return 500.
- **Route middleware order**: `[validateUserToken | verifyAdminAuthToken]`,
  then `checkPermission(MODULES.X)` (admin), then `checkAccess()`, then
  `upload.single/any`, then the controller. Add new admin routes to the right
  `MODULES` entry in `middleware/checkPermission.middleware.js`.
- **Controllers** export `exports.fnName = async (req, res) => {...}`; ids come
  as strings, convert with `new mongoose.Types.ObjectId()`; paginate with
  `start`/`limit`.
- **Coins**: `coin` = gold (spendable), `silverCoin` = earned/withdrawable.
  Every coin movement must write a `History` row with the right `HISTORY_TYPE`
  and use `$inc` with a balance guard; call `updateWealthLevel` after top-ups
  and `updateHostLevel` after host earnings.
- **Settings** are read from the global `settingJSON` (bare or `global.`);
  admin edits must call `updateSettingFile(setting)` to refresh it.
- **Emit from REST** via the global `io`; personal room is
  `globalRoom:<userId>`, live room is `LiveStreamer._id`.
- **Live SDK compatibility**: never rename/remove Agora fields
  (`agoraUid`, `channel`, `token`, `host2Channel`…). Tencent data is added
  alongside (`tencentUserId`, `tencent` block). See the Tencent doc.
- **Models**: `timestamps: true, versionKey: false`, defaults on every field,
  add indexes for new query paths. Dates/durations use `moment-timezone` in
  `Asia/Kolkata`; many `date` fields are strings.
- **Do not edit or require the obfuscated files**:
  `controllers/admin/admin.controller.js`, `routes/admin/admin.route.js`,
  `util/generateUserUniqueId.js`, `util/scheduler.js` (licence check that
  wipes admins and setting files on failure; currently unused).
- **Security hygiene**: `/api/user/*` game callbacks and `/api/client/test/*`
  are unauthenticated and the test config route returns the secret key. Do not
  widen them. Never log or return `TENCENT_SECRET_KEY`, gateway secrets or
  `Setting.privateKey` to clients.
- **Uploads** land in `storage/` (served at `/storage`); remove replaced files
  with `util/deletefile.js`.
- No linter or formatter is configured; match the surrounding style
  (2-space indent, double quotes, trailing commas).
