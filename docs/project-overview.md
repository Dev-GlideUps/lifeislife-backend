# LifeIsLive Backend — Project Overview

> Onboarding document for engineers joining the backend. It describes what the
> product is, how the code is organised, how data moves through the system, and
> how to run it locally. For deployment see [DEPLOYMENT.md](../DEPLOYMENT.md);
> for the in-progress Agora → Tencent migration see
> [tencent-backend-requirements.md](../tencent-backend-requirements.md).

---

## 1. What the product is

**LifeIsLive** is a live-streaming and short-video social app with a virtual
coin economy. This repository is its **REST + WebSocket backend** (Node.js). It
serves three separate front ends that live in other repositories:

| Front end | Stack | Talks to |
|---|---|---|
| Mobile app (users, hosts, agencies, coin traders) | Flutter (`fetch_setting_model.dart` in this repo is a copy of one of its model files) | `/api/client/*`, `/api/agency/*`, `/api/host/*`, Socket.IO |
| Admin panel | Next.js (`admin.lifeisliveapp.com`) | `/api/admin/*`, Socket.IO |
| Third-party game provider | Server-to-server | `/api/user/*` callbacks in `index.js` |

### The problem it solves

It is the single source of truth for a creator-economy app: who is live, who
is in which room, who sent which gift to whom, how many coins everyone has,
what hosts and agencies are owed, and what the app is allowed to do (feature
flags, gateway keys, rates) — all configurable from the admin panel without an
app release.

### Main features

- **Live video rooms** (single host, multi-host "call-join", PK battles between
  two hosts) and **audio rooms** with up to 15 seats, invites, locks and mutes.
- **Real-time gifting** with host/agency/admin revenue split, "lucky gift"
  jackpots, top-gifter leaderboards and app-wide broadcasts for big gifts.
- **1:1 private audio/video calls** billed per minute in coins.
- **Chat** (text, image, audio, gifts) with typing/seen indicators and push
  notifications.
- **Short videos and posts** with hashtags, songs, comments, likes, mentions,
  watch history and follower feeds.
- **Virtual economy**: gold coins (bought, spent) and silver coins (earned,
  withdrawable); coin plans purchasable through Stripe, Razorpay, Google Play,
  Apple, Flutterwave, Paystack, PayPal and Cashfree; coin traders who resell
  coins; referral rewards; daily login bonus.
- **Store**: avatar frames, themes and entry "rides" with time-limited validity.
- **Host programme**: host applications, host levels, host targets, agencies
  with commission rates, payout methods and payout requests for hosts,
  agencies and users.
- **Gamification**: wealth levels, host levels, third-party HTML games with a
  server-side wallet callback, legacy in-house games (teen patti, ferris wheel,
  roulette) kept as history models.
- **Admin back office**: dashboards, moderation (block, instant block, device
  ban, live ban, kick/mute from live), reports, verification requests, fake
  users/streams for demo data, banners, announcements, push notifications,
  role-based sub-admins, currency, and every setting the app reads.

### Who uses it

| Actor | How they authenticate | Where their endpoints live |
|---|---|---|
| App user | Firebase ID token + `x-user-uid` header | `routes/client` |
| Host (a user with role 2) | Same as user; host-specific reads use query ids | `routes/client`, `routes/host` |
| Agency owner (a user with role 3) | Secret key + `agencyId` in query | `routes/agency` |
| Coin trader (role 4) | Same as user | `routes/client/coinTrader*` |
| Admin / sub-admin | Firebase ID token; sub-admins are gated by RBAC | `routes/admin` |
| Third-party game server | None (open endpoints) | `index.js` |

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 (developed on v22.15.1), CommonJS | No TypeScript, no build step |
| HTTP | Express 4 | JSON body parsing, CORS open, `trust proxy` on |
| Real time | Socket.IO 4 | Single `socket.js` file (~8k lines, 58 inbound events) |
| Database | MongoDB via Mongoose 8 | ~65 models in `models/`, no migrations |
| Cache | Redis (node-redis 5) | Only used to cache live-stream lists/countries |
| Auth | Firebase Admin SDK | Verifies ID tokens, mints custom tokens, sends FCM push |
| Live media | Agora (`agora-access-token`), Tencent TRTC (`tls-sig-api-v2`), Zego (flags only) | Provider chosen by settings; Tencent rollout is additive |
| Payments | `stripe`, `razorpay`, `googleapis` (Play), `@apple/app-store-server-library` (StoreKit 2 JWS), plus `axios` calls for PayPal, Flutterwave, Paystack, Cashfree | Keys live in the Setting document; Google Play credentials may be overridden by `GOOGLE_PLAY_*` env vars |
| Email | Resend | Transactional mail from `util/emailService.js` |
| Uploads | Multer disk storage → `storage/` served at `/storage` | SVGA animations served from `/svga` |
| Scheduling | `node-cron` | One daily job in `index.js` (expire store items) |
| Validation | Joi (admin settings only) | Most controllers validate by hand |
| Dates | `moment-timezone` (Asia/Kolkata) and `dayjs` | Many `date` fields are **strings** |
| Dev | `nodemon` | `npm start` runs nodemon; no test runner, no linter |

---

## 3. Folder structure

```
lifeislife-backend/
├── index.js                  # App bootstrap: express, socket.io, settings, cron, game callbacks
├── socket.js                 # All Socket.IO handlers (chat, live, audio rooms, PK, calls, gifts)
├── checkAccess.js            # Middleware: shared API secret key (`key` header)
├── seed.js                   # One-off DB seeder (admin, gifts, levels, coin plans)
├── setting.example.js        # Fallback settings object + template for setting.js (gitignored)
├── .env                      # Local secrets (gitignored)
├── routes/
│   ├── route.js              # Mounts /admin, /client, /agency, /host
│   ├── admin/route.js        # Mounts every admin feature router behind admin auth
│   ├── client/route.js       # Mounts every app feature router (some behind user auth)
│   ├── agency/route.js
│   ├── host/route.js
│   └── <area>/<feature>.route.js
├── controllers/
│   └── <area>/<feature>.controller.js   # One exported async (req,res) per endpoint
├── models/                   # Mongoose schemas (shared by every area)
├── gamemodels/               # History schemas for legacy in-house games
├── middleware/
│   ├── validateUserToken.middleware.js    # Firebase user auth (+ TEST_TOKEN_ in dummy mode)
│   ├── verifyAuthToken.middleware.js      # Firebase token only (login/register)
│   ├── verifyAdminAuthToken.middleware.js # Admin or sub-admin by Firebase email/uid
│   └── checkPermission.middleware.js      # RBAC: MODULES x HTTP method -> action
├── types/constant.js         # Numeric enums (HISTORY_TYPE, ROLE_TYPE, LOGIN_TYPE, ...)
├── util/                     # Helpers: redis, multer, Tencent UserSig, level updates,
│                             #   id generators, email, Firebase init, file delete
├── docs/                     # This document
├── DEPLOYMENT.md             # Droplet + PM2 + Nginx + Docker runbook
├── tencent-backend-requirements.md  # Spec for the Agora -> Tencent migration
└── fetch_setting_model.dart  # Reference copy of the Flutter settings model
```

### Areas and prefixes

| Area | URL prefix | Auth applied in `routes/<area>/route.js` |
|---|---|---|
| admin | `/api/admin` | `verifyAdminAuthToken` on every feature router except `/admin` (login) and `/setting` (applied per route) |
| client | `/api/client` | `validateUserToken` on most routers; a few (setting, liveStreamer, history, gift categories…) apply it per route or rely on the secret key only |
| agency | `/api/agency` | Secret key only; `agencyId` comes from the query string |
| host | `/api/host` | Secret key only; `userId` comes from the query string |

Every feature router then adds `checkAccess()` (secret key) and, where needed,
`checkPermission(MODULES.X)` for sub-admins and `multer` upload handlers.

---

## 4. Core architecture

```
          Flutter app / Admin panel / Game provider
                 |  HTTPS (REST)            |  WebSocket
                 v                          v
   +-------------------------------------------------------------+
   | index.js                                                    |
   |  express -- cors/json/morgan/request-logger                 |
   |  app.use("/api", routes/route.js)   global.io = socket.io() |
   |  /api/user/* game callbacks         require("./socket")     |
   |  /.well-known/*, /storage, /svga    node-cron (daily expiry)|
   +-----------+---------------------------------+---------------+
               | routes -> middleware -> controllers  | socket.js handlers
               v                                      v
   +----------------------- models/ (Mongoose) ----------------------+
   | User . LiveStreamer . LiveStreamerHistory . History (ledger)    |
   | Chat/ChatTopic . Gift . Agency . PayoutRequest . Setting . ...  |
   +-----------+---------------------+---------------------+---------+
               v                     v                     v
            MongoDB               Redis (cache)     External services
                                                    Firebase . Agora . Tencent
                                                    Stripe/Razorpay/... . Resend
```

### Startup sequence (`index.js`)

1. Build the Express app, attach CORS, JSON parsing, Morgan and a verbose
   request/response logger (bodies are printed; passwords/tokens are masked).
2. Create the HTTP server and attach Socket.IO as **`global.io`**.
3. Connect Mongoose (`util/connection.js`) using `MongoDb_Connection_String`.
4. `initializeSettings()` loads the newest `Setting` document into
   **`global.settingJSON`** (falls back to `setting.example.js`). Everything
   else is required *after* this because middleware reads `settingJSON` at
   require time and exits the process if the Firebase private key is missing.
5. Mount `/api` routes, require `socket.js`, add `.well-known` deep-link
   endpoints and static folders, then listen on `PORT`.
6. Register the midnight cron that clears expired themes/frames/rides, and the
   unauthenticated third-party-game wallet endpoints.

### Global state you will meet

| Global | Set in | Used for |
|---|---|---|
| `global.io` (also bare `io`) | `index.js` | Emitting socket events from REST controllers (27 call sites) |
| `global.settingJSON` (also bare `settingJSON`) | `util/initializeSettings.js` | Feature flags, rates, gateway keys, Firebase service account |
| `global.updateSettingFile(setting)` | `index.js` | Admin setting controllers call it to persist to `setting.js` and refresh the global |

### Authentication and authorisation

- **Secret key** (`checkAccess.js`): header/body/query `key` must equal
  `process.env.secretKey`. Applied to almost every route in all four areas.
- **User auth** (`validateUserToken`): `Authorization: Bearer <Firebase ID
  token>` plus `x-user-uid`. Looks the user up by `firebaseUid`, rejects
  blocked / instant-blocked / device-banned users, sets `req.user = { uid,
  userId }`. When `settingJSON.isDummyData` is true, tokens of the form
  `TEST_TOKEN_<mongoUserId>_<anything>` are accepted (see
  `routes/client/test.route.js` and `testAuth.route.js`).
- **Admin auth** (`verifyAdminAuthToken`): Firebase token; matches an `Admin`
  (super admin, `req.admin`) or a `Subadmin` with populated `Role`
  (`req.subadmin`). `checkPermission(MODULES.X)` then maps the HTTP method to
  an action (`GET→List`, `POST→Create`, `PATCH/PUT→Edit|Update`,
  `DELETE→Delete`) and checks it against the role's permissions. Super admins
  bypass RBAC.
- **Agency / host areas** have no token check — only the secret key and ids in
  the query string.

### Live streaming model

- A live session is one `LiveStreamer` document (current room state: seats,
  co-host requests, PK config, blocked/kicked/muted lists, Agora channel +
  token, Tencent room id) plus one `LiveStreamerHistory` document (immutable
  session record: duration, coins, viewers, comments). The host `User` carries
  `isLive`, `liveStreamerId`, `liveHistoryId`.
- `liveType`: 1 video, 2 audio room, 3 multi-live, 4 call-join. PK battles set
  `isPkMode` and fill `pkConfig` for both hosts; see
  [pk-battle.md](pk-battle.md) for the full lifecycle.
- REST (`controllers/client/liveStreamer.controller.js`) creates/ends the
  session and issues Agora tokens and, when enabled, a `tencent` block built
  by `util/tencentUserSig.js`. Socket events (`socket.js`) handle everything
  that happens inside the room.
- Socket rooms: each connected user joins `globalRoom:<userId>` (from the
  handshake query) and is marked online; a live room is keyed by the
  `LiveStreamer._id`. A host that disconnects gets a 120-second grace period
  before the stream is ended (`pendingHostDisconnects` in `socket.js`).

### Settings

One `Setting` document holds every runtime knob: payment gateway toggles and
keys, Agora/Zego/Tencent flags (`liveSdkProvider` picks the SDK), coin rates
(`adminRate`, `agencyRate`, call rates, `loginBonus`), thresholds for
broadcasts, lucky-gift pool, third-party game list, policy links, default
profile photos, deep-link JSON and the Firebase service account
(`privateKey`). The client fetches it whole via
`GET /api/client/setting/loadAppSettings`; the admin edits it via
`/api/admin/setting/*`. Treat secret fields carefully: the current
`loadAppSettings` returns the entire object.

---

## 5. How data flows

### Request lifecycle (REST)

```
HTTP -> index.js logger -> routes/route.js -> routes/<area>/route.js
     -> routes/<area>/<feature>.route.js
        [validateUserToken | verifyAdminAuthToken] -> [checkPermission] -> checkAccess() -> [multer]
     -> controllers/<area>/<feature>.controller.js
        validate input -> Mongoose queries (often Promise.all + aggregate) -> optional io.emit / FCM
     -> res.status(200).json({ status, message, data })
```

Conventions: business failures return **HTTP 200 with `status: false`**;
only unexpected exceptions return 500. Pagination is `start`/`limit` in the
query. Ids arrive as strings and are converted with
`new mongoose.Types.ObjectId(...)`.

### Coin purchase (gold coins in)

1. App calls a gateway-specific endpoint in `controllers/client/coinPlan.controller.js`
   (e.g. `validateGooglePlayPurchase`, `validateApplePurchase`, `handlePaymentWithStripe`).
2. Controller verifies the receipt/signature with the provider.
3. `User` is updated with `$inc: { coin, topUpCoins }` and a `History` row of
   type `COIN_PLAN_PURCHASE` (7) is written. The purchase endpoints do **not**
   call `util/updateWealthLevel.js` today (only `user.controller.js` does), so
   wealth-level promotion happens on the next profile refresh.

Store purchases (in-app):

- `CoinPlan` carries `androidProductKey` (Google Play product id) and
  `iosProductKey` (App Store product id); `productKey` is the legacy field and
  is used as a fallback for both. The admin coin-plan endpoints accept and return
  all three.
- `POST /api/client/coinPlan/validateGooglePlayPurchase` checks the
  `productId` against the plan, verifies the token with the Android Publisher
  API (`purchaseState === 0`), and is idempotent per `purchaseToken`
  (`History.purchaseToken`, sparse index): a replayed token answers
  `status:true, "Coins already credited"` without crediting again. Credentials
  come from `GOOGLE_PLAY_PRIVATE_KEY` / `GOOGLE_PLAY_CLIENT_EMAIL` env vars
  first, then `Setting.googlePlayPrivateKey` (object or string) and
  `Setting.googlePlayServiceAccountEmail`.
- `POST /api/client/coinPlan/validateApplePurchase` (StoreKit 2) takes
  `productId`, `transactionId`, `signedTransaction` (JWS) and an optional
  `coinPlanId`; it verifies the JWS with `SignedDataVerifier`, checks bundle id
  (hard-coded `com.lifeis.live.ios`), product id, transaction id and
  revocation, resolves the plan by `coinPlanId` or `iosProductKey`, and is
  idempotent per `transactionId` (`History.transactionId`, sparse index).
  `verifyApplePurchase` is the legacy receipt endpoint and is still mounted.
- `History` rows for store purchases also store `orderId` (Google Play).

### Gift in a live room (coins move)

1. Viewer emits `giftToLiveStream` (JSON string) on the socket.
2. `socket.js` loads sender, receivers, gift, category and live history in
   parallel, checks balance, and emits `fetchLiveGifts` to the room (plus
   `proHighValueGift` to everyone if above `coinBroadcastThreshold`).
3. Sender's `coin`/`spentCoins` are updated atomically with a balance guard;
   `TopGifter` for the session is upserted and re-ranked.
4. Receiver (host) earnings are split using `settingJSON.adminRate` and the
   host's agency `commissionRate`; host `silverCoin`/`earnedHostCoins`,
   `LiveStreamer.earnedCoins`, `Agency` totals
   (`util/agencyEarnings.js`) and a `History` row of type `LIVE_GIFT` (6)
   are written; `util/updateHostLevel.js` may promote the host. PK gifts also
   update `pkConfig` ranks and emit `pkRankUpdate`.

### Earnings out

Hosts, agencies and users create `PayoutRequest` documents (person 1/2/3)
against an admin-defined `PayoutMethod`. Admin (or agency, for its hosts)
accepts/declines via `updateWithdrawalStatus`, which debits silver coins or
agency `netAvailableEarnings` and writes a `WITHDRAWAL` (8) history row.

### Store items

`executePurchaseItem` debits gold coins, writes `PurchasedItem` with an
`expiryDate`, and sets `activeTheme`/`activeAvtarFrame`/`activeRide` on the
user. The midnight cron in `index.js` nulls those fields when items expire.

### Third-party games

The game provider calls `POST /api/user/info` (profile + balance) and
`POST /api/user/balance/change` (debit/credit) in `index.js`. The latter
guards against overdraft, writes a `THIRD_PARTY_GAME` (19) history row, and
broadcasts `highCoinWinBroadcast` when a win exceeds `coinGameThreshold`.

### The ledger

`models/history.model.js` is the single wallet ledger. `type` (see
`HISTORY_TYPE` in `types/constant.js`) decides which fields are meaningful.
Most "history", "statistics" and dashboard endpoints are aggregations over
this collection, so keep writing to it whenever coins move.

---

## 6. Running locally

### Prerequisites

- Node.js 22 and npm 10
- MongoDB and Redis reachable from your machine (Docker is the easiest:
  `docker run -d -p 27017:27017 mongo` and `docker run -d -p 6379:6379 redis`)
- A Firebase project service-account JSON (for token verification and push)

### Environment

Create `.env` in the project root (it is gitignored). Variables actually read
by the code:

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | yes | HTTP/WebSocket port (5000 in production) |
| `MongoDb_Connection_String` | yes | Mongoose connection URI |
| `secretKey` | yes | Shared API key checked by `checkAccess.js` |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | no | Defaults to 127.0.0.1:6379, no password |
| `baseURL` | yes in practice | Public URL used to build file links (e.g. `https://api.lifeisliveapp.com/`) |
| `TENCENT_SECRET_KEY` | when Tencent enabled | Server-only TRTC secret for UserSig |
| `EMAIL` | for email | `from` address for Resend |
| `JWT_SECRET` | test routes only | Signs tokens returned by `/api/client/test/*` |
| `PAYPAL_MODE` | PayPal only | `sandbox` or `live` |
| `GOOGLE_PLAY_PRIVATE_KEY`, `GOOGLE_PLAY_CLIENT_EMAIL` | optional | Override the Google Play service-account credentials stored in `Setting` |
| `projectName` | optional | Used in email templates |

`DEPLOYMENT.md` lists a slightly different set of names (`mongoURI`,
`JWT_SECRET`, `AGORA_*`); the names in the table above are the ones the code
reads today. Agora and payment keys are **not** env vars — they live in the
`Setting` document (Google Play is the one exception, see the table).

### Firebase credentials

`util/privateKey.js` initialises Firebase Admin from `util/firebase.json` if
that file exists, otherwise from `settingJSON.privateKey`. The auth
middleware exits the process at startup when neither is available, so put a
service-account file at `util/firebase.json` for local work (and keep it out
of git — it is currently *not* in `.gitignore`).

### Install, seed, start

```bash
npm install
node seed.js        # optional: admin@lifeislive.net / admin123, gift categories,
                    # gifts, host levels, wealth levels, coin plans (idempotent)
npm start           # nodemon index.js
```

On first boot there is no `Setting` document, so `settingJSON` falls back to
`setting.example.js` (which has `isDummyData: true`). Create a real one via
the admin panel (`PATCH /api/admin/setting/modifySetting`) or by inserting a
document in Mongo; every subsequent admin edit also writes `setting.js` in
the project root.

### Smoke test

```bash
# secret key is whatever you set in .env
curl -H "key: <secretKey>" http://localhost:5000/api/client/live/tencentStatus

# dummy-mode login that bypasses Firebase (only while isDummyData is true)
curl -X POST http://localhost:5000/api/client/test/login \
     -H "Content-Type: application/json" -d "{\"email\":\"dev@example.com\"}"
# then send:  Authorization: Bearer TEST_TOKEN_<userId>_x   and   key: <secretKey>
```

Connect a Socket.IO client with `?globalRoom=globalRoom:<mongoUserId>` to
receive personal events.

### Build and test

There is no build step (plain CommonJS) and no automated test suite:
`npm test` is the default npm stub and exits non-zero. Verification today is
manual: run the server, hit endpoints with the test routes or the app, and
watch the console logger. Adding Jest/Supertest would be a welcome first
contribution; keep new tests out of the obfuscated files listed below.

---

## 7. Things to know before changing code

- **Obfuscated, vendor-licensed files** — `controllers/admin/admin.controller.js`,
  `routes/admin/admin.route.js`, `util/generateUserUniqueId.js` and
  `util/scheduler.js` are minified/obfuscated. `util/scheduler.js` is a weekly
  licence check that, on failure, deletes all admins, blanks the admin setting
  controller/route files and exits; it is **not required anywhere** right now.
  Do not require it, and avoid editing these files.
- **Backward compatibility for live SDKs** — older app builds read the Agora
  fields. Tencent support is strictly additive: never rename or remove
  `agoraUid`, `channel`, `token`, `host2Channel`, etc. Full rules are in
  `tencent-backend-requirements.md`.
- **Unauthenticated surfaces** — `/api/user/*` (game callbacks) and
  `/api/client/test/*` have no auth and `GET /api/client/test/config` returns
  the secret key. Disable or protect them before exposing a server publicly.
- **Everything is logged** — the request logger prints bodies and responses
  for every call; expect noisy consoles and avoid logging secrets.
- **Timezone** — durations and `date` strings are computed in `Asia/Kolkata`.
- **Uncommitted local changes** at the time of writing: `util/initializeSettings.js`
  now falls back to `setting.example.js` instead of a gitignored `setting.js`,
  and `util/firebase.json` is present but untracked.
