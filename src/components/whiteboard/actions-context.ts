"use client"

import { createContext, useContext } from "react"

import type { ProjectSource } from "@/lib/github/source"

// What node and edge components can ask the canvas to do.
export type WhiteboardActions = {
  // Opens the object's document the way its open mode says (R4.7, R4.8).
  openObject: (objectId: string) => void
  // The repository the project was imported from, which a box drawn for one
  // of its folders links to (code-link.ts).
  repository: ProjectSource | null
}

export const WhiteboardActionsContext = createContext<WhiteboardActions>({
  openObject: () => {},
  repository: null,
})

export const useWhiteboardActions = () => useContext(WhiteboardActionsContext)
