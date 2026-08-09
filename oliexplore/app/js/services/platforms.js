/* =====================================================================
   platforms.js — Registry of supported social platforms.

   Each platform declares its display metadata, character limit, and a
   `kind` flag indicating whether OliExplore can COLLECT from it,
   PUBLISH to it, or both. This registry is the single source of truth
   used by the collector, publisher, UI chips, and connection cards.

   The `auth` block describes the (simulated) OAuth login experience:
   the field label shown on the login screen and the list of permission
   scopes the user authorizes. To wire up a real integration later,
   point connect.js at the platform's real OAuth endpoint — no UI
   changes required.
   ===================================================================== */

export const PLATFORMS = [
  {
    id: "facebook",
    name: "Facebook",
    short: "fb",
    glyph: "f",
    charLimit: 63206,
    canCollect: true,
    canPublish: true,
    defaultConnected: false,
    sampleHandle: "@oliexplore",
    auth: {
      loginLabel: "Email or phone",
      loginPlaceholder: "you@example.com",
      scopes: [
        "Read posts from your Pages",
        "Publish posts on your behalf",
        "View post engagement insights",
      ],
    },
    // Real OAuth wiring. Facebook + Instagram share one Meta app (App ID).
    // Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens
    oauth: {
      clientIdField: "facebook",
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights",
      clientIdParam: "client_id",
      pkce: false,
    },
  },
  {
    id: "instagram",
    name: "Instagram",
    short: "ig",
    glyph: "◎",
    charLimit: 2200,
    canCollect: true,
    canPublish: true,
    defaultConnected: false,
    sampleHandle: "@oli.explore",
    auth: {
      loginLabel: "Username or email",
      loginPlaceholder: "yourusername",
      scopes: [
        "Read your media and captions",
        "Publish photos and reels",
        "View basic profile information",
      ],
    },
    // Instagram (business/creator) publishing goes through the Instagram
    // Graph API, authorized via the same Meta app as Facebook.
    // Docs: https://developers.facebook.com/docs/instagram-platform
    oauth: {
      clientIdField: "facebook",
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      scope: "instagram_basic,instagram_content_publish,pages_show_list",
      clientIdParam: "client_id",
      pkce: false,
    },
  },
  {
    id: "x",
    name: "X (Twitter)",
    short: "x",
    glyph: "X",
    charLimit: 280,
    canCollect: true,
    canPublish: true,
    defaultConnected: false,
    sampleHandle: "@oliexplore",
    auth: {
      loginLabel: "Username, email or phone",
      loginPlaceholder: "@yourhandle",
      scopes: [
        "Read your recent posts",
        "Post and repost on your behalf",
        "Read your profile information",
      ],
    },
    // X API v2 OAuth 2.0 (user context) — PKCE is mandatory.
    // Docs: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
    oauth: {
      clientIdField: "x",
      authorizeUrl: "https://twitter.com/i/oauth2/authorize",
      scope: "tweet.read tweet.write users.read offline.access",
      clientIdParam: "client_id",
      pkce: true,
    },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    short: "in",
    glyph: "in",
    charLimit: 3000,
    canCollect: false,
    canPublish: true,
    defaultConnected: false,
    sampleHandle: "OliExplore Inc.",
    auth: {
      loginLabel: "Email",
      loginPlaceholder: "you@company.com",
      scopes: [
        "Share posts on your behalf",
        "Read your basic profile",
      ],
    },
    // Not wired to a live proxy endpoint yet — demo mode only for now.
    oauth: null,
  },
  {
    id: "tiktok",
    name: "TikTok",
    short: "tt",
    glyph: "♪",
    charLimit: 2200,
    canCollect: true,
    canPublish: true,
    defaultConnected: false,
    sampleHandle: "@oliexplore",
    auth: {
      loginLabel: "Email or username",
      loginPlaceholder: "yourusername",
      scopes: [
        "Read your recent video captions",
        "Publish videos on your behalf",
        "Read your profile information",
      ],
    },
    // TikTok uses "client_key" (not "client_id") and its own domain.
    // Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management
    // NOTE: unaudited apps can only publish videos in PRIVATE viewing mode
    // (TikTok policy) — see server/README.md for details.
    oauth: {
      clientIdField: "tiktok",
      authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
      scope: "user.info.basic,video.publish,video.list",
      clientIdParam: "client_key",
      pkce: true,
    },
  },
  {
    id: "threads",
    name: "Threads",
    short: "th",
    glyph: "@",
    charLimit: 500,
    canCollect: true,
    canPublish: true,
    defaultConnected: false,
    sampleHandle: "@oli.explore",
    auth: {
      loginLabel: "Username or email",
      loginPlaceholder: "yourusername",
      scopes: [
        "Read your recent threads",
        "Publish threads on your behalf",
        "Read your profile information",
      ],
    },
    // Threads has its own app product/App ID in the Meta dashboard,
    // separate from a regular Facebook app.
    // Docs: https://developers.facebook.com/docs/threads
    oauth: {
      clientIdField: "threads",
      authorizeUrl: "https://threads.net/oauth/authorize",
      scope: "threads_basic,threads_content_publish",
      clientIdParam: "client_id",
      pkce: false,
    },
  },
];

/* O(1) lookup map. platformById() is called on every card render, every
   chip render, and inside every filter/sort pass — with Array#find that
   was an O(n) scan per call. With a Map built once at module load it's
   a constant-time lookup, which matters once the library grows past a
   handful of posts. */
const PLATFORM_MAP = new Map(PLATFORMS.map((p) => [p.id, p]));
export const platformById = (id) => PLATFORM_MAP.get(id);

export const collectablePlatforms = () => PLATFORMS.filter((p) => p.canCollect);
export const publishablePlatforms = () => PLATFORMS.filter((p) => p.canPublish);

/* Platforms that use an "@handle" style identity (everyone except LinkedIn). */
export const usesAtHandle = (id) => id !== "linkedin";
