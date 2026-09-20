import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
