import type { NextConfig } from "next";

// Sent with every response. The one that matters most is frame-ancestors:
// no other site may put these pages in a frame, so none can hide the page
// where a person approves an AI agent (/oauth/consent) under a decoy and
// borrow their click. Nothing here is meant to be framed; embeds are images.
// A full Content-Security-Policy for scripts needs a nonce on every page and
// is not attempted here.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in the app uses these. Fullscreen and the clipboard are left
  // alone: videos go fullscreen, and copy and paste use the clipboard.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
]

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js": it tells a stranger nothing they need.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // A public project's pages say noindex in their HTML; its embed images
      // and anything else under it say so here, where HTML cannot.
      { source: "/p/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // A header set here replaces the same header set by a route, so the
      // embed image's own policy, which lets the picture load and run
      // nothing, is restated here with the frame rule added.
      {
        source: "/p/:projectId/d/:docId/embed.svg",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" }],
      },
    ]
  },
  // Only the Docker image wants a self-contained server folder. Vercel and
  // `pnpm start` do not, and ignore it when it is unset.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // BlockNote's server utilities run the editor headless, React included.
  // Bundled into a server action they would load under the server-components
  // build of React, which has no createContext. Left to Node, they load the
  // ordinary one. Yjs goes with them: a document made by one copy of Yjs
  // cannot be written to by another. So does BlockNote's core, where the
  // server's copy of the editor schema is defined: a block made by one copy
  // is not a block to the other.
  serverExternalPackages: ["@blocknote/server-util", "@blocknote/core", "yjs"],
  experimental: {
    // An import sends notes in batches of about 600 KB (lib/import/limits),
    // but a batch is never less than one note, and the largest note allowed,
    // escaped as JSON, can pass the default of 1 MB. Still well under what
    // Vercel accepts in one request.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
