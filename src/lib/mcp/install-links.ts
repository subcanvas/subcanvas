// One-click installs, for the clients that have them. Each format is the
// client's own and documented by it:
//   Cursor:  https://cursor.com/docs/context/mcp/install-links
//   VS Code: https://code.visualstudio.com/api/extension-guides/ai/mcp
//   Claude Code: https://code.claude.com/docs/en/mcp, and for its plugins
//     https://code.claude.com/docs/en/plugin-marketplaces
//   Codex: https://developers.openai.com/codex/mcp

export const SERVER_NAME = "subcanvas"

// The config is the server's entry in Cursor's mcp.json, base64-encoded.
export function cursorInstallLink(url: string) {
  const config = btoa(JSON.stringify({ url }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`
}

// The config is the server's entry in VS Code's mcp.json plus its name.
export function vscodeInstallLink(url: string) {
  const config = JSON.stringify({ name: SERVER_NAME, type: "http", url })
  return `vscode:mcp/install?${encodeURIComponent(config)}`
}

export function claudeCodeCommand(url: string) {
  return `claude mcp add --transport http ${SERVER_NAME} ${url}`
}

// The Claude Code plugin in this repository, plugins/subcanvas, listed by the
// marketplace at the repository's root (.claude-plugin/marketplace.json). It
// brings the server and a skill for drawing. Its server is subcanvas.app's,
// written in plugins/subcanvas/.mcp.json: a self-hosted server is added
// beside it with `claudeCodeCommand`.
export const PLUGIN_MARKETPLACE = "subcanvas/subcanvas"
export const PLUGIN_ID = "subcanvas@subcanvas"
export const PLUGIN_SERVER_URL = "https://subcanvas.app/mcp"

export function claudeCodePluginCommand() {
  return `claude plugin marketplace add ${PLUGIN_MARKETPLACE} && claude plugin install ${PLUGIN_ID}`
}

// Two commands, not one: Codex adds the server and signs in separately. The
// same file serves the Codex CLI, its IDE extension, and the ChatGPT desktop
// app, so this is the whole setup for all three.
export function codexCommand(url: string) {
  return `codex mcp add ${SERVER_NAME} --url ${url} && codex mcp login ${SERVER_NAME}`
}
