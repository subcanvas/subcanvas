import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BlockNote's server utilities run the editor headless, React included.
  // Bundled into a server action they would load under the server-components
  // build of React, which has no createContext. Left to Node, they load the
  // ordinary one. Yjs goes with them: a document made by one copy of Yjs
  // cannot be written to by another.
  serverExternalPackages: ["@blocknote/server-util", "yjs"],
};

export default nextConfig;
