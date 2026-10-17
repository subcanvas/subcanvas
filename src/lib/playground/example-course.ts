import "server-only"

import * as Y from "yjs"

import { toBase64 } from "@/lib/sync/encoding"
import { applyBlockEdit, parseMarkdown } from "@/lib/text/blocks"
import { uuidV5 } from "@/lib/whiteboard/description-document"
import { edgeSides } from "@/lib/whiteboard/sides"
import { edgesMap, nodesMap, toYMap, type ColorKey, type OpenMode } from "@/lib/whiteboard/schema"

import type { PlaygroundSeed, SeedDocument } from "./seed"

// The note-taking playground's example (/try/productivity): a course, Psych
// 101, laid out the way a student would. One whiteboard of topics, each box
// holding its notes, Memory opening into a whiteboard of its own, and an
// arrow holding why it is there. The boxes open their notes in different
// ways (R4.8), so the setting is there to find. Built once when the app is
// built (app/api/playground/seed/productivity), like the software example.

type Topic = {
  title: string
  emoji: string
  color: ColorKey
  x: number
  y: number
  notes?: string
  openMode?: OpenMode
}

const WIDTH = 230
const HEIGHT = 76

const TOPICS: Topic[] = [
  {
    title: "Research methods",
    emoji: "🔬",
    color: "blue",
    x: 0,
    y: 0,
    notes: `Lecture 1 and 2.

## Three kinds of study
- **Descriptive**: watch and record. Case studies, surveys, naturalistic observation.
- **Correlational**: two things move together. Says nothing about cause.
- **Experimental**: change one thing (the independent variable), measure another (the dependent variable). The only kind that shows cause.

## Words to know
- Random assignment, not random sampling, is what makes an experiment fair.
- Double-blind: neither the participant nor the researcher knows who got what.

<aside data-icon="💡">

Correlation is not causation. Ice cream sales and drownings both go up in summer.

</aside>`,
  },
  {
    title: "The brain",
    emoji: "🧠",
    color: "pink",
    x: 340,
    y: 0,
    notes: `Lecture 4.

## Neurons
- A neuron fires all or nothing. A stronger signal fires more often, not harder.
- Synapse: the gap between neurons. Neurotransmitters cross it.

## The four lobes
| Lobe | Does |
| --- | --- |
| Frontal | Planning, decisions, movement |
| Parietal | Touch, where things are in space |
| Temporal | Hearing, language, memory |
| Occipital | Vision |

## Hippocampus
Turns new experiences into long-term memories. Patient H.M. lost his in 1953 and could not form new ones after that.`,
  },
  {
    title: "Sensation & perception",
    emoji: "👁️",
    color: "purple",
    x: 680,
    y: 0,
    notes: `Lecture 5.

- **Sensation**: the senses pick up energy (light, sound, pressure).
- **Perception**: the brain decides what it means.
- Absolute threshold: the faintest signal noticed half the time.
- Weber's law: a change is noticed when it is a constant fraction of the original. $\\Delta I / I = k$`,
  },
  {
    title: "Learning",
    emoji: "🔔",
    color: "orange",
    x: 0,
    y: 230,
    notes: `Lecture 6.

## Classical conditioning (Pavlov)
A bell, rung before food, comes to make the dog salivate on its own.

## Operant conditioning (Skinner)
- Reinforcement makes a behavior more likely. Punishment makes it less likely.
- Positive adds something, negative takes something away.`,
  },
  { title: "Memory", emoji: "💭", color: "teal", x: 340, y: 230 },
  {
    title: "Exam prep",
    emoji: "📝",
    color: "yellow",
    x: 680,
    y: 230,
    // Opens over the whiteboard, to show there is more than one way.
    openMode: "modal",
    notes: `Midterm: Thursday, November 12. Chapters 1 to 7.

- [x] Make flashcards for the four lobes
- [x] Redo the research methods practice quiz
- [ ] Explain encoding, storage, retrieval out loud
- [ ] Practice test on Sunday, no notes
- [ ] Review the forgetting curve the night before`,
  },
]

const MEMORY: Topic[] = [
  {
    title: "Encoding",
    emoji: "✍️",
    color: "blue",
    x: 0,
    y: 0,
    notes: `Getting information in.

- Attention first: what is not noticed is not encoded.
- Meaning beats repetition. Linking a fact to something you know encodes it deeper than rereading it.`,
  },
  {
    title: "Storage",
    emoji: "🗄️",
    color: "teal",
    x: 340,
    y: 0,
    notes: `Keeping it.

1. Sensory memory: under a second.
2. Short-term memory: about 20 seconds, around 7 items.
3. Long-term memory: no known limit.`,
  },
  {
    title: "Retrieval",
    emoji: "🔎",
    color: "purple",
    x: 680,
    y: 0,
    notes: `Getting it back out.

- **Recall**: from nothing, as on an essay question.
- **Recognition**: picking it out, as on multiple choice. Easier.
- Context helps: you remember better where you learned it.`,
  },
  {
    title: "Forgetting curve",
    emoji: "📉",
    color: "orange",
    x: 170,
    y: 240,
    notes: `Ebbinghaus, 1885. He learned lists of nonsense syllables and tested himself later.

- Most of the loss happens in the first day.
- After that, it slows down.

How much is left after time $t$, where $S$ is how strong the memory is:

$$
R = e^{-t/S}
$$

<aside data-icon="💡" data-background-color="yellow">

Every review makes $S$ bigger, so the next drop is slower.

</aside>`,
  },
  {
    title: "Spaced repetition",
    emoji: "🗓️",
    color: "green",
    x: 520,
    y: 240,
    notes: `Review just before you would forget.

| Review | When |
| --- | --- |
| 1st | The next day |
| 2nd | 3 days later |
| 3rd | A week later |
| 4th | Before the exam |

Cramming feels faster. Spacing is what still works a month later.`,
  },
]

const STUDY_NOTES = `What the memory unit says about studying for this exam.

- Test yourself instead of rereading. Recalling something strengthens it more than reading it again (Roediger and Karpicke, 2006).
- Spread the reviews out. See Spaced repetition, inside Memory.
- Sleep the night before. Memories are consolidated during sleep.`

// Arrows by the titles of the boxes they join, with a label, and the notes
// they hold if any.
type Arrow = [from: string, to: string, label: string, notes?: string]

const TOP_ARROWS: Arrow[] = [
  ["Research methods", "The brain", "how we know"],
  ["The brain", "Sensation & perception", "makes sense of"],
  ["Learning", "Memory", "is stored in"],
  ["The brain", "Memory", "hippocampus"],
  ["Memory", "Exam prep", "how to study", STUDY_NOTES],
]

const MEMORY_ARROWS: Arrow[] = [
  ["Encoding", "Storage", ""],
  ["Storage", "Retrieval", ""],
  ["Forgetting curve", "Spaced repetition", "is slowed by"],
  ["Retrieval", "Spaced repetition", "practice it"],
]

export async function courseSeed(): Promise<PlaygroundSeed> {
  const documents: SeedDocument[] = []
  const contents: Record<string, string> = {}
  const encode = (change: (doc: Y.Doc) => void) => {
    const doc = new Y.Doc()
    change(doc)
    return toBase64(Y.encodeStateAsUpdate(doc))
  }
  // A page that belongs to a box or an arrow, with the id the app gives it.
  const describe = async (whiteboardId: string, objectId: string, title: string, markdown: string) => {
    const id = await uuidV5(whiteboardId, objectId)
    documents.push({ id, type: "text", kind: "description", title, parentId: whiteboardId, parentObjectId: objectId })
    const blocks = await parseMarkdown(markdown)
    contents[id] = encode((doc) => applyBlockEdit(doc, { kind: "append", blocks }))
    return id
  }

  // One whiteboard: its boxes, the notes in them, and its arrows. `inside`
  // names a box that holds a whiteboard of its own.
  async function board(
    id: string,
    topics: Topic[],
    arrows: Arrow[],
    inside?: { title: string; whiteboardId: string }
  ) {
    const ids = new Map(topics.map((topic) => [topic.title, crypto.randomUUID()]))
    const nodes: [string, Record<string, unknown>][] = []
    for (const topic of topics) {
      const nodeId = ids.get(topic.title)!
      let held: Record<string, unknown> = {}
      if (inside?.title === topic.title)
        held = { docId: inside.whiteboardId, docType: "whiteboard", openMode: "navigate" }
      else if (topic.notes)
        held = {
          docId: await describe(id, nodeId, topic.title, topic.notes),
          docType: "text",
          openMode: topic.openMode ?? "panel",
        }
      nodes.push([
        nodeId,
        {
          kind: "plain",
          x: topic.x,
          y: topic.y,
          width: WIDTH,
          height: HEIGHT,
          title: topic.title,
          color: topic.color,
          shape: "rounded",
          emoji: topic.emoji,
          ...held,
        },
      ])
    }
    const box = (title: string) => {
      const topic = topics.find((each) => each.title === title)!
      return { x: topic.x, y: topic.y, width: WIDTH, height: HEIGHT }
    }
    const edges: [string, Record<string, unknown>][] = []
    for (const [from, to, label, notes] of arrows) {
      const edgeId = crypto.randomUUID()
      const held = notes
        ? { docId: await describe(id, edgeId, label, notes), docType: "text", openMode: "panel" }
        : {}
      edges.push([
        edgeId,
        {
          source: ids.get(from)!,
          target: ids.get(to)!,
          ...edgeSides(box(from), box(to)),
          shape: "spline",
          stroke: "solid",
          direction: "forward",
          color: "default",
          label,
          ...held,
        },
      ])
    }
    contents[id] = encode((doc) => {
      for (const [nodeId, fields] of nodes) nodesMap(doc).set(nodeId, toYMap(fields))
      for (const [edgeId, fields] of edges) edgesMap(doc).set(edgeId, toYMap(fields))
    })
    return ids
  }

  const topId = crypto.randomUUID()
  const memoryId = crypto.randomUUID()
  documents.push({ id: topId, type: "whiteboard", kind: "standard", title: "Psych 101", parentId: null, parentObjectId: null })
  const topIds = await board(topId, TOPICS, TOP_ARROWS, { title: "Memory", whiteboardId: memoryId })
  documents.push({
    id: memoryId,
    type: "whiteboard",
    kind: "standard",
    title: "Memory",
    parentId: topId,
    parentObjectId: topIds.get("Memory")!,
  })
  await board(memoryId, MEMORY, MEMORY_ARROWS)

  return { topDocumentId: topId, documents, contents }
}
