import type { Tool } from "../tool"
import { documentTools } from "./documents"
import { integrationTools } from "./integrations"
import { projectTools } from "./projects"
import { textTools } from "./text"
import { whiteboardTools } from "./whiteboard"

// Everything an agent can do, in the order it is listed to one.
export const tools: Tool[] = [
  ...projectTools,
  ...documentTools,
  ...textTools,
  ...whiteboardTools,
  ...integrationTools,
]
