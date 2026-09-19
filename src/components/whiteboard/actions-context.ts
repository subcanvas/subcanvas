"use client"

import { createContext, useContext } from "react"

// What node and edge components can ask the canvas to do.
export type WhiteboardActions = {
  // Opens the object's document the way its open mode says (R4.7, R4.8).
  openObject: (objectId: string) => void
}

export const WhiteboardActionsContext = createContext<WhiteboardActions>({
  openObject: () => {},
})

export const useWhiteboardActions = () => useContext(WhiteboardActionsContext)
