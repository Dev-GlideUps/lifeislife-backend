# Tencent RTC Migration — Backend Requirements

**To:** Backend developer
**Subject:** API changes needed to move the app from Agora to Tencent RTC (TRTC),
and from DeepAR to Tencent Effect (Xmagic)

This document is self-contained — it describes only what the backend needs to
build. The app-side plan is a separate document; you don't need it to act on this.

---

## 1. Context in one paragraph

The app currently streams live video through **Agora** and applies camera
filters through **DeepAR**. We are moving to **Tencent RTC** for streaming and
**Tencent Effect (Xmagic)** for filters. The rollout is gradual: both stacks must
work at the same time, chosen by a server flag, until Tencent has run clean in
production. **Therefore every change below is additive — please do not remove or
rename any existing Agora or Zego field.** Older app builds in the wild will keep
reading them.

### Scope: this is a like-for-like SDK swap

**No new features, no new capabilities, no improvements.** Everything that works
today must work identically afterwards, and nothing new is being added on either
side. If a change below is not strictly required to make Tencent work, it is
marked **OPTIONAL** and you should feel free to skip it.

Required vs optional at a glance:

| Item | Section | Status |
|---|---|---|
| Tencent account + SDKAppID / SecretKey | 3 | **Required** |
| UserSig endpoint | 4 | **Required** — unavoidable, see section 2 |
| `isTencentEnabled` + `tencentSdkAppId` in settings | 5 | **Required** |
| `isAgoraEnabled: false` for Tencent users | 5 | **Required** |
| `tencent` block on live/audio-room responses | 6 | **Required** |
| `tencentUserId` in socket payloads | 8 | **Required** |
| `host2Tencent` in PK payloads | 7 | **Required** (phase 2) |
| `tencent` block in call signalling | 10 | **Required** (phase 4) |
| Xmagic licences in settings | 3, 5 | **Required** (phase 3) |
| `provider` field on filter records | 9 | **Required** (phase 3) |
| Admin panel fields for the above | 11 | **Required** |
| `liveSdkProvider` string | 5 | *Optional* — hardening, see 5 |
| Server-assigned room ids | 6.1 | *Optional* — keep today's client-generated ids |
| `assetMd5` / `assetVersion` on filters | 9 | *Optional* — integrity checking we don't have today |
| `role` in the UserSig request | 4 | *Optional* |

---

## 2. The one change that actually matters

Everything else in this document is routine field-adding. This is not:

> **Agora shares one token per room. TRTC requires one signature per user.**

Here is how identity works in the app **today**:

| Thing | Who creates it today |
|---|---|
| Channel name | **The app**, randomly, then sent to you in start-live |
| Host's numeric uid | **The app**, randomly (6 digits), sent to you |
| Viewer's numeric uid | **The app**, randomly, per viewer — never sent to you at all |
| Token | You, once, for the room |
| Which token a viewer uses | **The host's token** — every viewer shares it |

TRTC does not work like this. Its credential is called **UserSig**. It is a
signature computed over `SDKAppID + SDKSecretKey + userId + expiry`. It is bound
to **one specific user id** and **cannot be shared between people**. It must be
generated **on the server**, because the secret key must never be shipped inside
the app.

So the central piece of work for you is a **UserSig endpoint** (section 4). Once
that exists, the rest of this document is mostly adding fields to responses.

**A second consequence:** TRTC user ids are **strings**, not integers. We
currently store an integer Agora uid on live records, on seat records, and inside
socket payloads. Those need a parallel string field (section 8).

---

## 3. Credentials to obtain

| Item | Notes |
|---|---|
| Tencent Cloud account with **TRTC** activated | — |
| **SDKAppID** | A number. Safe to send to the app. |
| **SDKSecretKey** | **Server-side only. Never send this to the app, never embed it in any client-facing response.** |
| **Tencent Effect (Xmagic)** activated | A *separate product*, licensed and billed separately from TRTC |
| Xmagic **licence URL + licence key**, Android | Bound to our Android package name |
| Xmagic **licence URL + licence key**, iOS | Bound to our iOS bundle id |

⚠️ **Xmagic licences are tied to the app's package name / bundle id.** If our
debug and release builds use different identifiers, we need separate licences.
Please confirm which identifiers the licences were issued against.

---

## 4. NEW ENDPOINT — UserSig

This is the critical new piece. Everything in phase 1 is blocked on it.

**Proposed route:** `POST /api/client/live/tencentUserSig`

**Headers:** same authentication as every other client endpoint today
(secret key header, bearer token, uid header).

### Request

```jsonc
{
  "userId": "665f1a2b3c4d5e6f7a8b9c0d",   // our own user id
  "roomId": "live_665f1a2b_1727000000",   // optional, for audit/scoping only
  "role": "anchor"                         // "anchor" | "audience"
}
```

### Response

```jsonc
{
  "status": true,
  "message": "UserSig generated",
  "data": {
    "sdkAppId": 1400000000,
    "userId": "665f1a2b3c4d5e6f7a8b9c0d",
    "userSig": "eJyrVgrxCdYrSy1SsoquVsp...",
    "expireAt": 1727086400,     // unix seconds, ABSOLUTE
    "expireIn": 86400           // seconds remaining, convenience
  }
}
```

### Implementation rules

1. **Generate server-side, always.** The SDKSecretKey must never reach the app.
   If it leaks, anyone can mint identities on our account and we pay for their
   traffic. Tencent publishes signing helpers for Node, PHP, Java, Python and Go.

2. **Take `userId` from the auth token, not from the request body.** This is a
   security requirement, not a preference. Without it, any authenticated user can
   request a signature for anyone else's id and then impersonate them inside a
   room — join their broadcast as them, or occupy their seat.

3. **Lifetime: 24 hours** is Tencent's usual recommendation.

4. **Return `expireAt` as an absolute unix timestamp.** The app refreshes *before*
   expiry rather than reacting to a mid-broadcast disconnect. The endpoint must be
   safe to call repeatedly for the same user.

5. **Rate limit it.** One signature per user per room is normal usage. Hundreds
   per minute is abuse.

6. **`role` is OPTIONAL.** TRTC has its own privilege model for restricting who
   may publish, but we do not use one today on Agora either, so adding it would
   be a new capability. Return the same signature regardless of role — the app
   sets the role itself, exactly as it does now. The field can stay in the
   request for future use or be dropped entirely.

### Optional optimisation

If convenient, **embed a fresh `userSig` directly in the start-live and
live-detail responses** (sections 5 and 6) so the common paths avoid a second
round trip. The standalone endpoint above is still required, for refresh.

---

## 5. App settings API — new fields

**Endpoint:** existing `/api/client/setting/loadAppSettings`

Add to the existing `data` object. **Keep all current Agora/Zego/DeepAR fields
untouched.**

```jsonc
{
  "status": true,
  "message": "...",
  "data": {
    // ======== EXISTING — do not change or remove ========
    "isAgoraEnabled": true,
    "agoraAppId": "...",
    "agoraAppCertificate": "...",
    "isZegoEnabled": false,
    "zegoAppId": "...",
    "zegoAppSign": "...",
    "androidEffectLicenseKey": "...",   // DeepAR — keep during transition
    "iosEffectLicenseKey": "...",       // DeepAR — keep during transition

    // ======== NEW — TRTC ========
    "isTencentEnabled": true,
    "tencentSdkAppId": 1400000000,      // NUMBER, not a string

    // ======== NEW — Tencent Effect (Xmagic) ========
    "isTencentEffectEnabled": true,
    "tencentEffectAndroidLicenseUrl": "https://license.vod2.myqcloud.com/.../v_cube.license",
    "tencentEffectAndroidLicenseKey": "...",
    "tencentEffectIosLicenseUrl": "https://license.vod2.myqcloud.com/.../v_cube.license",
    "tencentEffectIosLicenseKey": "...",

    // ======== NEW — rollout control ========
    "liveSdkProvider": "agora"          // "agora" | "zego" | "tencent"
  }
}
```

**`tencentSecretKey` must never appear in this response.**

### The minimum you have to do

`isTencentEnabled` and `tencentSdkAppId` are the only two new streaming fields
that are strictly required. They follow **exactly the pattern `isZegoEnabled`
already uses** — no new mechanism, no new concept.

`liveSdkProvider` below is **optional hardening**. Read it, decide, and tell us
which way you went; we build against either.

### OPTIONAL — why `liveSdkProvider` would help

Today the app *infers* which SDK to use from a pair of boolean flags. An
inconsistent inference is genuinely dangerous, and we have already been bitten by
it: **if the host resolves to one SDK and a viewer resolves to another, both
appear present in the room** — the chat works, the viewer count is correct — **but
no audio or video passes between them, and nothing reports an error.** It looks
like a broken stream with no diagnostic anywhere.

One explicit string removes the ambiguity.

**If you skip it**, that is fine — the app falls back to the boolean flags, which
is how it works today. The rollout rule below then becomes more important, not
less, because the flags are the only thing keeping a room consistent.

### Critical rollout rule

**Everyone watching the same broadcast must resolve to the same SDK** — whether
that is decided by `liveSdkProvider` or by the boolean flags. If this is rolled
out by percentage, bucket by **the broadcast / the host**, never by the
individual viewer. Bucketing per viewer will produce exactly the silent failure
described above.

### `isAgoraEnabled` must be turned OFF for Tencent users

Adding `isTencentEnabled: true` is **not enough on its own**. The app resolves
the SDK in a fixed priority order, and **Agora wins whenever it is enabled**:

```
if (Agora enabled AND agoraAppId present)  -> use Agora      ← checked FIRST
if (Zego  enabled AND zego creds present)  -> use Zego
otherwise                                  -> no SDK selected
```

So a user bucketed to Tencent must receive:

```jsonc
{
  "liveSdkProvider": "tencent",
  "isTencentEnabled": true,
  "isAgoraEnabled": false,      // ← REQUIRED, or the app keeps using Agora
  "isZegoEnabled": false,

  "agoraAppId": "...",          // keep the credentials themselves
  "agoraAppCertificate": "..."  // only the FLAG goes false
}
```

Keep the Agora **credentials** in the response — only the **flag** changes. That
way flipping the flag back is an instant rollback with no app update.

### ⚠️ Do not send `isAgoraEnabled: false` to older app builds

This is the part that can take live streaming down entirely, so it needs stating
plainly.

An older app build **does not know what `liveSdkProvider` or `isTencentEnabled`
mean** — it ignores both. It only reads the boolean flags. If such a build
receives `isAgoraEnabled: false` and `isZegoEnabled: false`, it falls through to
**"no SDK selected"** and **live streaming simply does not work at all** — no
video, no audio, and the room still opens normally so it looks like a broken app
rather than a configuration problem.

**Bucketing must therefore be gated on app version, not only on percentage:**

| App build | Send |
|---|---|
| Supports Tencent (new build) and bucketed to Tencent | `liveSdkProvider: "tencent"`, `isTencentEnabled: true`, `isAgoraEnabled: false` |
| Supports Tencent but bucketed to Agora | `liveSdkProvider: "agora"`, `isAgoraEnabled: true` |
| **Older build, any bucket** | `liveSdkProvider: "agora"`, **`isAgoraEnabled: true`** — always |

The app version is already available to you from the request headers / user
record. If distinguishing builds is not practical, then **keep
`isAgoraEnabled: true` for everyone** and let the new builds decide from
`liveSdkProvider` alone — tell us if you take that route, because then the app
must treat `liveSdkProvider` as outranking the old flags rather than merely
supplementing them.

**One more detail:** when `isAgoraEnabled` is absent from the response entirely,
the app currently treats it as **`true`**. So omitting the field does not disable
Agora — it must be sent explicitly as `false`.

---

## 6. Live room APIs — new fields

### 6.1 Start live streaming

**Current request (query params):** `userId`, `liveType`, `channel`, `agoraUID`

**Keep the request exactly as it is.** The app carries on sending `channel` and
`agoraUID` as it does today, and you carry on storing them. Nothing about this
request changes.

The only addition is a `tencent` block in the **response**.

> *OPTIONAL, and only if you want it:* the app currently invents the channel name
> and the host's numeric uid itself, which is a weakness we already have —
> server-assigned room ids would be safer and are the standard TRTC pattern. But
> it is **not required for the swap**, it changes our client code, and it can be
> done later as its own piece of work. **Default assumption: we keep today's
> behaviour.** Tell us only if you decide otherwise.

**Response — add a `tencent` block alongside the existing fields:**

```jsonc
{
  "status": true,
  "message": "Live started",
  "data": {
    // ======== EXISTING — unchanged ========
    "_id": "...",
    "liveHistoryId": "...",
    "userId": "...",
    "channel": "123456789",
    "token": "006...",            // Agora token
    "agoraUid": 483920,           // Agora numeric uid
    "liveType": 1,
    "isPkMode": false,
    // ... everything else stays exactly as it is ...

    // ======== NEW ========
    "tencent": {
      "roomId": "live_665f1a2b_1727000000",
      "roomIdType": "string",                // "string" | "number"
      "numericRoomId": 0,                    // only when roomIdType is "number"
      "userId": "665f1a2b3c4d5e6f7a8b9c0d",  // THIS user's TRTC id (string)
      "userSig": "eJyrVgrxCdYrSy1SsoquVsp...",
      "expireAt": 1727086400,
      "sdkAppId": 1400000000
    }
  }
}
```

**About the room id type.** TRTC supports numeric room ids and string room ids,
and they are **separate namespaces** — numeric room `12345` and string room
`"12345"` are two different rooms, and people in each cannot see each other. Pick
one convention and apply it everywhere.

**We recommend string room ids**, because they can embed our own live-history id
and stay readable in logs. Whichever you choose:
- it must be identical for the host and every viewer of that broadcast
- `roomIdType` must state which one it is

### 6.2 Create audio room

Same change. Audio rooms also send `channel` and `agoraUID` today, and need the
same `tencent` block in the response.

### 6.3 Live list and live detail

**This is where "one token per room" concretely stops working.**

Every endpoint that returns a live a **viewer** can join must include the same
`tencent` block, with `userId` and `userSig` **scoped to the requesting viewer** —
not the host's.

That covers:
- the live list / explore feed
- the scroll-live list
- single-live detail
- the socket response carrying a single live user's details

**If generating a signature for every row of a list is too expensive**, this
alternative is fine: return only `roomId`, `roomIdType` and `sdkAppId` in list
responses, and let the app fetch its own signature from the endpoint in section 4
at the moment it actually joins. **Tell us which approach you take** — we build
against it either way.

---

## 7. PK battles — cross-room instead of relay

**How it works today.** Two hosts stay in their own rooms and one host's media is
*relayed* into the other's channel. You supply the opponent's channel name and a
token for it (`host2Channel`, `host2Token`).

**How it works in TRTC.** There is no relay. Two anchors form a **cross-room
link**: each anchor names the opponent's room id and user id, and receives the
other's stream directly. **No token for the other room is involved** — each anchor
authenticates as themselves with their own signature and merely *names* the room
they are linking to.

**What you need to add** to the PK socket payloads and any PK REST response:

```jsonc
{
  // ======== EXISTING — keep during transition ========
  "host2Channel": "987654321",
  "host2Token": "006...",

  // ======== NEW ========
  "host2Tencent": {
    "roomId": "live_770a3b4c_1727000500",
    "roomIdType": "string",
    "userId": "770a3b4c5d6e7f8a9b0c1d2e"
  }
}
```

**Question for you:** do PK battles need to be **recorded**, or pushed to **CDN
as a single combined stream**? If yes, the two anchors must publish into a mixed
stream rather than linking directly, which is a different and larger piece of
work on both sides. If battles are watch-live-only, direct linking is simpler and
lower latency. **Please confirm** — this decides the architecture.

---

## 8. Socket payloads — add string user ids

The Agora numeric uid appears in socket payloads today: for seat occupancy, for
multi-guest participants, and for matching a video tile to a person.

**Requirement:** wherever a payload carries `agoraUid`, add a parallel
**`tencentUserId` (string)**. **Do not replace the existing field** — older app
builds still read it.

| Payload | Field today | Add |
|---|---|---|
| Seat update / seated users update | `agoraUid` per seat | `tencentUserId` per seat |
| Multi-guest participant list | `agoraUid` per participant | `tencentUserId` per participant |
| Join request sent / participant added | `agoraUid` | `tencentUserId` |
| Single live user response | `agoraUid` | `tencentUserId` + the `tencent` block from 6.1 |
| PK answer / PK request received | `host2Channel`, `host2Token` | `host2Tencent` (section 7) |
| Call started / incoming call | `agoraUID`, `channel`, `token` | `tencent` block (section 10) |

**The value should simply be our own user id string** — the same one used to
generate the signature. Please don't introduce a second identity space.

---

## 9. Filter catalogue — Xmagic assets

**Today.** The catalogue serves `.deepar` files; the app downloads each one and
points the SDK at the file path.

**The problem.** DeepAR files do not convert to Xmagic. Every filter must be
re-sourced or rebuilt. Xmagic's model is also different in kind:

- **Beauty parameters** (smoothing, whitening, face slimming, eye enlarging …)
  are *numeric runtime parameters*, not downloadable files. **These need no
  catalogue entry at all** — they become sliders in the app.
- **Filters / LUTs** are small image assets.
- **Stickers / AR effects / makeup** are bundles that must be downloaded.

So the catalogue only carries the last two categories.

**Proposed response shape**, with a `provider` discriminator so both stacks can be
served during the transition:

```jsonc
{
  "status": true,
  "message": "",
  "totalRecords": 42,
  "data": [
    {
      "_id": "665f...",
      "title": "Soft Glow",
      "icon": "https://cdn.../icons/soft_glow.png",
      "isActive": true,

      "provider": "tencent",        // "deepar" | "tencent"
      "effectType": "filter",       // "filter" | "sticker" | "makeup" | "segmentation"
      "asset": "https://cdn.../xmagic/soft_glow.zip",
      "assetMd5": "d41d8cd98f00b204e9800998ecf8427e",
      "assetVersion": 3,
      "minSdkVersion": "3.5.0",     // optional
      "bundleName": "soft_glow"     // the name the SDK expects inside the bundle
    },
    {
      "_id": "665e...",
      "title": "Bunny Ears",
      "icon": "https://cdn.../icons/bunny.png",
      "isActive": true,
      "provider": "deepar",
      "effectType": "sticker",
      "effect": "/uploads/effects/bunny.deepar"   // existing field, unchanged
    }
  ]
}
```

**Required:**

1. **Add `provider`, and support filtering by it** (e.g. `?provider=tencent`), so
   an app on the Agora/DeepAR path never receives Xmagic assets and vice versa.
   This one is not optional — without it, a device on either path can be handed
   assets its SDK cannot load.
2. **Keep existing DeepAR rows working** until Agora is fully removed.

**Optional:**

3. *OPTIONAL — `assetMd5` and `assetVersion`.* The current catalogue has no
   integrity check and no cache-invalidation signal, so a half-downloaded or
   corrupt filter stays cached on the device forever. That is a pre-existing
   weakness, **not something the Tencent swap introduces**, so fixing it here is
   a choice rather than a requirement. If you skip it, the app keeps the same
   download behaviour it has today. `minSdkVersion` and `bundleName` are likewise
   only needed if Xmagic's asset packaging turns out to require them.

---

## 10. One-to-one video calls

Call ringing payloads currently carry an Agora channel, token and numeric uid.
Add the same block:

```jsonc
{
  // ======== EXISTING ========
  "callId": "...",
  "callType": "video",
  "callerId": "...",
  "receiverId": "...",
  "channel": "123456789",
  "token": "006...",
  "agoraUID": 483920,

  // ======== NEW ========
  "tencent": {
    "roomId": "call_665f1a2b_770a3b4c",
    "roomIdType": "string",
    "sdkAppId": 1400000000,
    "userId": "665f1a2b3c4d5e6f7a8b9c0d",   // scoped to the RECIPIENT of this event
    "userSig": "eJyrVgrxCdYrSy1SsoquVsp...",
    "expireAt": 1727086400
  }
}
```

Note the scoping: the **caller's** copy of the event carries the caller's
signature; the **receiver's** copy carries the receiver's. Both name the same room.

---

## 11. Admin panel

Fields needed:

- Tencent **SDKAppID** and **SecretKey** (key **write-only** — never returned to
  any client-facing endpoint)
- `isTencentEnabled` toggle
- `liveSdkProvider` selector, plus whatever percentage / bucketing control the
  rollout will use (bucketed **by broadcast**, see section 5)
- Xmagic licence URL + key, per platform
- `provider`, `effectType`, `asset`, `assetMd5`, `assetVersion`, `bundleName` on
  each filter record

---

## 12. Priority order

| # | Item | Section | Priority |
|---|---|---|---|
| 1 | Tencent account + SDKAppID/SecretKey | 3 | **Start now** |
| 2 | UserSig endpoint | 4 | **Start now — everything is blocked on it** |
| 3 | Settings API fields | 5 | **Start now** |
| 4 | Start-live + create-audio-room `tencent` block | 6.1, 6.2 | **Start now** |
| 5 | Live list / detail per-viewer signatures | 6.3 | **Start now** |
| 6 | Socket payload `tencentUserId` | 8 | **Start now** |
| 7 | Admin panel fields | 11 | With #3 |
| 8 | PK cross-room fields | 7 | After phase 1 ships |
| 9 | Xmagic licences | 3 | Before filter work |
| 10 | Filter catalogue changes | 9 | Before filter work |
| 11 | Call signalling `tencent` block | 10 | Last |

**Items 2–7 are the blocking set** — the app team cannot start phase 1 until they
are in place.

Item 1 (account setup, billing approval, licence issuance) has administrative
lead time nobody controls. **Please start it first**, before any code: it is free
to start and it gates everything else.

---

## 13. Questions we need answered before the app team starts

1. **Numeric or string room ids?** (6.1) — the one answer we genuinely need
   before starting.
2. **Will list endpoints embed per-viewer signatures, or should the app fetch its
   own at join time?** (6.3) — either is fine, we just need to know which.
3. **Do PK battles need recording or CDN output?** This decides direct room
   linking vs. stream mixing. If battles are watch-live-only today, the answer is
   simply "no" and we keep it that way. (7)
4. **Which package name / bundle id were the Xmagic licences issued against?** (3)
5. **Can bucketing be gated on app version?** If not, we keep
   `isAgoraEnabled: true` for everyone and new builds decide from
   `liveSdkProvider` alone. (5)
6. **Are you adding `liveSdkProvider`, or staying with the boolean flags?** Both
   work; we just need to know. (5)

---

## 14. Checklist

**Credentials**
- [ ] Tencent Cloud account created, TRTC activated
- [ ] SDKAppID and SDKSecretKey issued; key stored server-side only
- [ ] Tencent Effect (Xmagic) activated
- [ ] Xmagic licence URL + key for Android, matching our package name
- [ ] Xmagic licence URL + key for iOS, matching our bundle id

**APIs — required**
- [ ] Settings API returns `isTencentEnabled` + `tencentSdkAppId`
- [ ] Settings API returns the Xmagic licence fields (before phase 3)
- [ ] Tencent-bucketed users receive `isAgoraEnabled: false` **explicitly** (omitting it is read as `true`)
- [ ] Agora *credentials* still returned even when the Agora *flag* is false, so rollback needs no app update
- [ ] Bucketing is gated on app version — older builds always receive `isAgoraEnabled: true`
- [ ] `POST /api/client/live/tencentUserSig` live
- [ ] Start-live returns a `tencent` block (request shape unchanged)
- [ ] Create-audio-room returns a `tencent` block (request shape unchanged)
- [ ] Live list / detail return per-viewer `tencent` data
- [ ] PK payloads carry `host2Tencent`
- [ ] Filter catalogue carries `provider` and is filterable by it
- [ ] Socket payloads carry `tencentUserId` alongside `agoraUid`
- [ ] Call signalling carries a `tencent` block scoped per recipient

**APIs — optional, skip unless you want them**
- [ ] `liveSdkProvider` string in settings
- [ ] Server-assigned room ids instead of client-generated
- [ ] `assetMd5` / `assetVersion` on filter records
- [ ] `role` honoured in the UserSig request

**Security**
- [ ] SDKSecretKey appears in **no** client-facing response anywhere
- [ ] UserSig endpoint ignores the `userId` in the request body and uses the
      authenticated user instead
- [ ] UserSig endpoint is rate limited

**Compatibility**
- [ ] All existing Agora, Zego and DeepAR fields still present and working
- [ ] An older app build that knows nothing about Tencent still functions
- [ ] No existing endpoint changed its **request** shape
- [ ] No existing field renamed, removed, or changed type
- [ ] No behaviour added that the app does not already have today
