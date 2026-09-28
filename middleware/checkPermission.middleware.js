const MODULES = {
  USER: "apps/user",
  USER_VERIFICATION: "user-verification",
  HOST_APPLICATION: "host/application",
  HOST_LIST: "host/list",
  AGENCY: "agency",
  COIN_TRADER: "coin-trader",
  ANNOUNCEMENTS: "announcements",
  BANNER_SPLASH: "banner/splash",
  BANNER_HOME: "banner/home",
  BANNER_GIFT: "banner/gift",
  BANNER_GAME: "banner/game",
  SOCIAL_MEDIA_POSTS: "social-media/posts",
  SOCIAL_MEDIA_VIDEOS: "social-media/videos",
  SONGS_CATEGORIES: "songs/categories",
  SONGS_LIST: "songs/list",
  HASHTAGS: "hashtags",
  GIFTS: "gifts",
  STORE_RIDES: "store/rides",
  STORE_THEMES: "store/themes",
  STORE_FRAMES: "store/frames",
  REACTION: "reaction",
  BEAUTY_EFFECT: "beautyEffect",
  GAME: "game",
  GAME_HISTORY: "game-history",
  COIN_PLAN: "coin-plan",
  ORDER_HISTORY: "order-history",
  WEALTH_LEVEL: "wealth-level",
  HELP: "help",
  REPORTS: "reports",
  REFERRAL_SYSTEM: "referral-system",
  PAYMENT_METHODS: "payment-methods",
  PAYOUT_REQUESTS: "payout-requests",
  ROLES: "roles",
  TEAM: "team",
  SETTINGS: "settings",
  PROFILE: "profile",
};

/**
 * HTTP method → permission action(s).
 * PATCH/PUT can be stored as either "Edit" or "Update" in the DB,
 * so we check for either.
 */
const METHOD_TO_ACTIONS = {
  GET: ["List"],
  POST: ["Create"],
  PATCH: ["Edit", "Update"],
  PUT: ["Edit", "Update"],
  DELETE: ["Delete"],
};

/**
 * @param {string} module - One of the MODULES values (e.g. MODULES.CATEGORY)
 */
const checkPermission = (module) => {
  return (req, res, next) => {
    // ── 1. Super-admin bypass ──────────────────────────────────────────────
    if (req.admin) return next();

    // ── 2. Staff (sub-admin) gate ──────────────────────────────────────────
    if (req.subadmin) {
      const permissions = req.subadmin?.role?.permissions;

      if (!permissions || !Array.isArray(permissions)) {
        console.warn(`⚠️ [RBAC] Staff ${req.subadmin._id} has no permissions array on their role.`);
        return res.status(403).json({
          status: false,
          message: "Access denied. No permissions configured for your role.",
        });
      }

      // a. Module check
      const modulePermission = permissions.find((p) => p.module === module);

      if (!modulePermission) {
        console.warn(`⚠️ [RBAC] Staff ${req.subadmin._id} denied — module "${module}" not in role.`);
        return res.status(403).json({
          status: false,
          message: `Access denied. You do not have access to the "${module}" module.`,
        });
      }

      // b. Action check
      const requiredActions = METHOD_TO_ACTIONS[req.method] || [];
      const grantedActions = modulePermission.actions || [];

      const hasAction = requiredActions.some((action) => grantedActions.includes(action));

      if (!hasAction) {
        console.warn(`⚠️ [RBAC] Staff ${req.subadmin._id} denied — action [${requiredActions.join(" or ")}] not permitted on module "${module}". Granted: [${grantedActions.join(", ")}]`);
        return res.status(403).json({
          status: false,
          message: `Access denied. You do not have permission to perform this action on the "${module}" module.`,
        });
      }

      // c. All good
      console.log(`✅ [RBAC] Staff ${req.subadmin._id} — access granted for [${req.method}] on module "${module}".`);
      return next();
    }

    // ── 3. Neither admin nor staff (auth middleware mis-order) ─────────────
    console.warn("⚠️ [RBAC] Neither req.admin nor req.subadmin is set. Possible middleware mis-order.");
    return res.status(401).json({
      status: false,
      message: "Unauthorized. Authentication required.",
    });
  };
};

module.exports = { checkPermission, MODULES };
