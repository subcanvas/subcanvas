import { ICON_NODES } from "./icon-data"

// The icons a node or an edge can wear: a set chosen for drawing systems and
// plans, not the whole of Lucide. An object stores the Lucide name. The
// drawing data for each one is in icon-data.ts, written from the installed
// lucide-react by `node scripts/generate-whiteboard-icons.mjs` (run it after
// changing this list), so the canvas and the image renderer draw the same
// paths and neither needs React to do it.

export type IconChoice = {
  name: string
  label: string
  // Extra words the search matches, for what the name does not say.
  keywords: string
}

export type IconCategory = { label: string; icons: IconChoice[] }

const icon = (name: string, label: string, keywords = ""): IconChoice => ({ name, label, keywords })

export const ICON_CATEGORIES: IconCategory[] = [
  {
    label: "Infrastructure",
    icons: [
      icon("server", "Server", "host machine backend"),
      icon("server-cog", "Server settings", "worker service"),
      icon("database", "Database", "storage sql postgres"),
      icon("database-zap", "Fast database", "cache redis"),
      icon("hard-drive", "Hard drive", "disk storage volume"),
      icon("cloud", "Cloud", "hosting provider"),
      icon("cloud-upload", "Cloud upload", "deploy push"),
      icon("cloud-download", "Cloud download", "pull fetch"),
      icon("container", "Container", "docker image"),
      icon("box", "Box", "module unit"),
      icon("boxes", "Boxes", "cluster kubernetes pods"),
      icon("package", "Package", "library dependency npm"),
      icon("layers", "Layers", "stack queue tiers"),
      icon("cpu", "Processor", "cpu compute chip"),
      icon("microchip", "Microchip", "hardware embedded"),
      icon("memory-stick", "Memory", "ram"),
      icon("network", "Network", "topology load balancer"),
      icon("router", "Router", "gateway"),
      icon("wifi", "Wi-Fi", "wireless"),
      icon("cable", "Cable", "wire connection"),
      icon("plug", "Plug", "connector integration plugin"),
      icon("unplug", "Unplugged", "disconnected offline"),
      icon("power", "Power", "on off"),
      icon("satellite-dish", "Satellite dish", "broadcast signal"),
      icon("radio", "Radio", "broadcast pubsub"),
      icon("archive", "Archive", "backup cold storage"),
    ],
  },
  {
    label: "Code",
    icons: [
      icon("code", "Code", "source program"),
      icon("braces", "Braces", "json object api"),
      icon("terminal", "Terminal", "cli shell command"),
      icon("square-function", "Function", "lambda serverless"),
      icon("zap", "Zap", "function trigger event fast lambda"),
      icon("webhook", "Webhook", "callback http"),
      icon("workflow", "Workflow", "pipeline whiteboard"),
      icon("waypoints", "Waypoints", "graph mesh routing"),
      icon("git-branch", "Branch", "git version"),
      icon("git-merge", "Merge", "git"),
      icon("git-pull-request", "Pull request", "git review"),
      icon("git-commit-horizontal", "Commit", "git"),
      icon("git-fork", "Fork", "git"),
      icon("binary", "Binary", "bits data"),
      icon("hash", "Hash", "number channel id"),
      icon("bug", "Bug", "defect issue"),
      icon("flask-conical", "Flask", "test experiment lab"),
      icon("component", "Component", "part widget"),
      icon("blocks", "Blocks", "building modules"),
      icon("puzzle", "Puzzle", "plugin extension"),
      icon("bot", "Bot", "robot agent automation"),
      icon("brain", "Brain", "ai model machine learning"),
      icon("sparkles", "Sparkles", "ai magic new"),
    ],
  },
  {
    label: "Data and messages",
    icons: [
      icon("list-ordered", "Ordered list", "queue fifo"),
      icon("list-todo", "To-do list", "tasks backlog"),
      icon("table", "Table", "rows columns spreadsheet"),
      icon("funnel", "Funnel", "filter"),
      icon("message-square", "Message", "chat comment"),
      icon("messages-square", "Messages", "conversation chat"),
      icon("mail", "Mail", "email"),
      icon("inbox", "Inbox", "queue incoming"),
      icon("send", "Send", "publish outgoing"),
      icon("bell", "Bell", "notification alert"),
      icon("megaphone", "Megaphone", "announce broadcast marketing"),
      icon("rss", "Feed", "rss stream subscribe"),
      icon("upload", "Upload", "export"),
      icon("download", "Download", "import"),
      icon("link", "Link", "url reference"),
      icon("arrow-right-left", "Exchange", "sync transfer both ways"),
      icon("refresh-cw", "Refresh", "sync retry reload"),
      icon("repeat", "Repeat", "loop cron"),
      icon("shuffle", "Shuffle", "random route"),
      icon("activity", "Activity", "monitoring health pulse"),
      icon("chart-bar", "Bar chart", "analytics metrics"),
      icon("chart-line", "Line chart", "analytics metrics trend"),
      icon("gauge", "Gauge", "performance speed rate limit"),
    ],
  },
  {
    label: "Security and people",
    icons: [
      icon("lock", "Lock", "secure private"),
      icon("lock-open", "Unlocked", "public open"),
      icon("key", "Key", "secret credential"),
      icon("key-round", "Round key", "api key token password"),
      icon("shield", "Shield", "security protection firewall"),
      icon("shield-check", "Shield check", "verified secure"),
      icon("globe-lock", "Secure web", "https tls vpn"),
      icon("fingerprint-pattern", "Fingerprint", "biometric identity"),
      icon("scan-face", "Face scan", "biometric"),
      icon("log-in", "Sign in", "login auth"),
      icon("id-card", "ID card", "identity profile"),
      icon("eye", "Eye", "visible watch observe"),
      icon("eye-off", "Hidden", "private invisible"),
      icon("ban", "Ban", "blocked forbidden"),
      icon("user", "User", "person account"),
      icon("users", "Users", "people team group"),
      icon("user-cog", "User settings", "admin role"),
      icon("user-check", "Verified user", "approved"),
      icon("contact", "Contact", "address book crm"),
      icon("handshake", "Handshake", "partner agreement deal"),
    ],
  },
  {
    label: "Devices and places",
    icons: [
      icon("globe", "Globe", "web internet world dns"),
      icon("monitor", "Monitor", "desktop screen browser"),
      icon("laptop", "Laptop", "computer client"),
      icon("smartphone", "Smartphone", "mobile phone app"),
      icon("app-window", "App window", "browser frontend"),
      icon("layout-dashboard", "Dashboard", "admin panel"),
      icon("panels-top-left", "Panels", "layout ui"),
      icon("building", "Building", "company office enterprise"),
      icon("store", "Store", "shop merchant"),
      icon("house", "House", "home"),
      icon("landmark", "Bank", "institution government"),
      icon("map-pin", "Map pin", "location region"),
      icon("truck", "Truck", "delivery shipping logistics"),
      icon("plane", "Plane", "travel flight"),
      icon("ship", "Ship", "shipping release"),
    ],
  },
  {
    label: "Commerce",
    icons: [
      icon("credit-card", "Credit card", "payment billing stripe"),
      icon("shopping-cart", "Shopping cart", "checkout order"),
      icon("wallet", "Wallet", "balance funds"),
      icon("banknote", "Banknote", "money cash"),
      icon("receipt", "Receipt", "invoice bill"),
      icon("tag", "Tag", "price label"),
    ],
  },
  {
    label: "Files and media",
    icons: [
      icon("file", "File", "document"),
      icon("file-text", "Text file", "document page"),
      icon("file-code", "Code file", "source script"),
      icon("folder", "Folder", "directory"),
      icon("book-open", "Book", "docs documentation guide"),
      icon("notebook-pen", "Notebook", "notes journal"),
      icon("clipboard-list", "Clipboard", "checklist form"),
      icon("image", "Image", "picture photo"),
      icon("video", "Video", "film stream"),
      icon("music", "Music", "audio sound"),
      icon("mic", "Microphone", "voice audio"),
      icon("camera", "Camera", "photo capture"),
      icon("trash", "Trash", "delete remove"),
    ],
  },
  {
    label: "Planning",
    icons: [
      icon("clock", "Clock", "time schedule"),
      icon("timer", "Timer", "timeout duration"),
      icon("rotate-ccw-clock", "History", "log audit past"),
      icon("calendar", "Calendar", "date schedule"),
      icon("kanban", "Kanban", "board sprint"),
      icon("milestone", "Milestone", "roadmap signpost"),
      icon("flag", "Flag", "feature flag goal"),
      icon("target", "Target", "goal objective"),
      icon("rocket", "Rocket", "launch release deploy"),
      icon("lightbulb", "Lightbulb", "idea"),
      icon("star", "Star", "favorite important"),
      icon("heart", "Heart", "like health"),
      icon("circle-check", "Done", "check success ok"),
      icon("circle-x", "Failed", "error cross no"),
      icon("triangle-alert", "Warning", "alert caution risk"),
      icon("info", "Info", "information note"),
      icon("circle-question-mark", "Question", "help unknown"),
      icon("search", "Search", "find lookup index"),
      icon("settings", "Settings", "gear configuration"),
      icon("sliders-horizontal", "Sliders", "controls tuning"),
      icon("wrench", "Wrench", "tool fix maintenance"),
      icon("hammer", "Hammer", "build tool"),
      icon("pen-tool", "Pen tool", "design draw"),
      icon("palette", "Palette", "design colors theme"),
      icon("wand-sparkles", "Magic wand", "generate automatic"),
    ],
  },
]

export const ICON_CHOICES: IconChoice[] = ICON_CATEGORIES.flatMap((category) => category.icons)

const LABELS = new Map(ICON_CHOICES.map((choice) => [choice.name, choice.label]))

// An icon name from the document is only a string: it may be one this version
// does not have, and then there is nothing to draw.
export const iconNode = (name: string | null) =>
  name && Object.hasOwn(ICON_NODES, name) ? ICON_NODES[name] : null

export const iconLabel = (name: string | null) => (name ? LABELS.get(name) ?? null : null)
