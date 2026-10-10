"use client"

import { createContext, useContext } from "react"

import type { ProjectSource } from "@/lib/github/source"

// How typing a box's name on the canvas ends: kept as it is, or kept and
// then the next box drawn from it (Tab to the right, Shift+Tab below), or
// given up, which takes away a box that was made a moment ago to be named.
export type NameEnd = "keep" | "right" | "below" | "cancel"

// What node and edge components can ask the canvas to do.
export type WhiteboardActions = {
  // Opens the object's document the way its open mode says (R4.7, R4.8).
  openObject: (objectId: string) => void
  // The repository the project was imported from, which a box drawn for one
  // of its folders links to (code-link.ts).
  repository: ProjectSource | null
  // The node whose name is being typed on the canvas, if any.
  naming: string | null
  rename: (nodeId: string, title: string) => void
  finishNaming: (nodeId: string, end: NameEnd) => void
}

export const WhiteboardActionsContext = createContext<WhiteboardActions>({
  openObject: () => {},
  repository: null,
  naming: null,
  rename: () => {},
  finishNaming: () => {},
})

export const useWhiteboardActions = () => useContext(WhiteboardActionsContext)
