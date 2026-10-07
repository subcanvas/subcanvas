import { describe, expect, it } from "vitest"

import type { Diagram } from "./diagram"
import { looksLikeMermaid, parseMermaid } from "./parse"

// A corpus of Mermaid as people and agents write it: the examples in
// Mermaid's own documentation, diagrams from READMEs, and what a model
// produces when asked for one.

function parsed(text: string): Diagram {
  const result = parseMermaid(text)
  if (!result.ok) throw new Error(result.error)
  return result.diagram
}

const titles = (diagram: Diagram) => Object.fromEntries(diagram.boxes.map((box) => [box.key, box.title]))
const shapes = (diagram: Diagram) => Object.fromEntries(diagram.boxes.map((box) => [box.key, box.shape]))
const pairs = (diagram: Diagram) => diagram.arrows.map((arrow) => `${arrow.source}>${arrow.target}`)

describe("flowcharts", () => {
  it("reads the classic decision flow", () => {
    const diagram = parsed(`flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]`)
    expect(diagram.kind).toBe("flowchart")
    expect(diagram.direction).toBe("TB")
    expect(titles(diagram)).toEqual({
      A: "Christmas", B: "Go shopping", C: "Let me think", D: "Laptop", E: "iPhone", F: "Car",
    })
    expect(shapes(diagram)).toMatchObject({ A: "rectangle", B: "rounded", C: "diamond" })
    expect(diagram.arrows.map((arrow) => arrow.label)).toEqual(["Get money", "", "One", "Two", "Three"])
    expect(diagram.arrows.every((arrow) => arrow.direction === "forward" && arrow.stroke === "solid")).toBe(true)
    expect(diagram.notes.join(" ")).toMatch(/Font Awesome/)
  })

  it("takes every direction, and graph as well as flowchart", () => {
    for (const [header, direction] of [
      ["graph TD", "TB"], ["graph TB", "TB"], ["flowchart BT", "BT"], ["flowchart LR", "LR"], ["graph RL", "RL"], ["flowchart", "TB"],
    ])
      expect(parsed(`${header}\n  A --> B`).direction).toBe(direction)
  })

  it("maps every bracket shape to the nearest shape the whiteboard has", () => {
    const diagram = parsed(`flowchart LR
    a[Rectangle] --> b(Rounded) --> c([Stadium]) --> d[[Subroutine]]
    e[(Database)] --> f((Circle)) --> g(((Double))) --> h>Asymmetric]
    i{Decision} --> j{{Hexagon}} --> k[/Lean right/] --> l[\\Lean left\\]
    m[/Trapezoid\\] --> n[\\Inverted/]`)
    expect(shapes(diagram)).toEqual({
      a: "rectangle", b: "rounded", c: "rounded", d: "rectangle", e: "cylinder", f: "ellipse", g: "ellipse",
      h: "rectangle", i: "diamond", j: "hexagon", k: "parallelogram", l: "parallelogram", m: "parallelogram",
      n: "parallelogram",
    })
    expect(titles(diagram).l).toBe("Lean left")
    expect(diagram.notes.join(" ")).toMatch(/Trapezoids are drawn as parallelograms/)
    expect(diagram.notes.join(" ")).toMatch(/subroutine shape/)
  })

  it("reads the newer shape syntax", () => {
    const diagram = parsed(`flowchart TD
    A@{ shape: cyl, label: "Orders DB" }
    B@{ shape: doc, label: "Invoice" }
    C@{ shape: cloud }
    D@{ shape: text, label: "Just words" }
    E@{ shape: bolt, label: "Spark" }
    A --> B --> C`)
    expect(shapes(diagram)).toMatchObject({ A: "cylinder", B: "document", C: "cloud", E: "rectangle" })
    expect(titles(diagram)).toMatchObject({ A: "Orders DB", B: "Invoice", C: "C", D: "Just words" })
    expect(diagram.boxes.find((box) => box.key === "D")?.kind).toBe("text")
    expect(diagram.notes.join(" ")).toMatch(/bolt/)
  })

  it("reads chains and ampersands", () => {
    const diagram = parsed(`graph LR
    A --> B --> C
    a1 & a2 --> b1 & b2`)
    expect(pairs(diagram)).toEqual(["A>B", "B>C", "a1>b1", "a1>b2", "a2>b1", "a2>b2"])
  })

  it("reads every kind of link and both ways of labelling one", () => {
    const diagram = parsed(`flowchart LR
    A --- B
    B -- text --> C
    C -.-> D
    D -. maybe .-> E
    E ==> F
    F == strong ==> G
    G <--> H
    H --o I
    I --x J
    J ~~~ K
    K --->|long| L
    L -->|"quoted | pipe"| M`)
    const by = (key: string) => diagram.arrows.find((arrow) => arrow.source === key)!
    expect(by("A")).toMatchObject({ direction: "none", stroke: "solid", label: "" })
    expect(by("B")).toMatchObject({ direction: "forward", label: "text" })
    expect(by("C")).toMatchObject({ direction: "forward", stroke: "dotted" })
    expect(by("D")).toMatchObject({ stroke: "dotted", label: "maybe" })
    expect(by("E")).toMatchObject({ direction: "forward", stroke: "solid" })
    expect(by("F")).toMatchObject({ label: "strong" })
    expect(by("G")).toMatchObject({ direction: "both" })
    expect(by("H")).toMatchObject({ direction: "forward" })
    expect(by("J")).toMatchObject({ hidden: true })
    expect(by("K")).toMatchObject({ label: "long", length: 2 })
    const notes = diagram.notes.join(" ")
    expect(notes).toMatch(/Thick links/)
    expect(notes).toMatch(/Circle and cross/)
    expect(notes).toMatch(/Invisible links/)
  })

  it("reads links written without spaces", () => {
    const diagram = parsed(`graph TD;
    A-->B;
    B---C;
    C-.->D;
    D==>E;
    E--label-->F;`)
    expect(pairs(diagram)).toEqual(["A>B", "B>C", "C>D", "D>E", "E>F"])
    expect(diagram.arrows[4].label).toBe("label")
  })

  it("reads a whole diagram written on one line", () => {
    expect(pairs(parsed("graph LR; A-->B; B-->C"))).toEqual(["A>B", "B>C"])
  })

  it("makes subgraphs groups, nested and linked to", () => {
    const diagram = parsed(`flowchart TB
    c1-->a2
    subgraph one [The first]
    a1-->a2
    end
    subgraph "Second group"
    b1-->b2
    subgraph inner
      b3
    end
    end
    subgraph three
    c1-->c2
    end
    one --> three
    three --> b3`)
    expect(diagram.groups).toEqual([
      { key: "one", title: "The first", parent: null },
      { key: "Second group", title: "Second group", parent: null },
      { key: "inner", title: "inner", parent: "Second group" },
      { key: "three", title: "three", parent: null },
    ])
    const groupOf = Object.fromEntries(diagram.boxes.map((box) => [box.key, box.group]))
    // a2 is named outside first, and drawn in the subgraph that names it next.
    expect(groupOf).toMatchObject({ a1: "one", a2: "one", b1: "Second group", b3: "inner", c1: "three", c2: "three" })
    expect(pairs(diagram)).toContain("one>three")
    expect(diagram.boxes.map((box) => box.key)).not.toContain("one")
  })

  it("reads past comments, styles and classes, and says what was not used", () => {
    const diagram = parsed(`%% A comment
%%{init: {"theme": "dark"}}%%
flowchart LR
    %% Another comment
    A[Start]:::green --> B[End]
    classDef green fill:#9f6,stroke:#333
    class B green
    style A fill:#f9f
    linkStyle 0 stroke:#ff3
    click A "https://example.com" "Open"`)
    expect(pairs(diagram)).toEqual(["A>B"])
    expect(titles(diagram)).toEqual({ A: "Start", B: "End" })
    const notes = diagram.notes.join(" ")
    expect(notes).toMatch(/settings/)
    expect(notes).toMatch(/Classes/)
    expect(notes).toMatch(/Styles and classes/)
    expect(notes).toMatch(/Link styles/)
    expect(notes).toMatch(/Click actions/)
  })

  it("cleans labels: quotes, line breaks, Markdown strings, entity codes", () => {
    const diagram = parsed(`flowchart LR
    A["Quoted (with parens)"] --> B["Line one<br/>line two"]
    B --> C["\`**Bold** and _italic_\`"]
    C --> D["A #quot;quote#quot; and #35;hash"]
    D --> E["Fish &amp; chips"]`)
    expect(titles(diagram)).toEqual({
      A: "Quoted (with parens)",
      B: "Line one line two",
      C: "Bold and italic",
      D: 'A "quote" and #hash',
      E: "Fish & chips",
    })
  })

  it("takes the title from front matter, inside a Markdown fence", () => {
    const diagram = parsed("Here is the diagram:\n\n```mermaid\n---\ntitle: Checkout\n---\nflowchart LR\n  Cart --> Pay\n```\n")
    expect(diagram.title).toBe("Checkout")
    expect(pairs(diagram)).toEqual(["Cart>Pay"])
  })

  it("keeps the last definition of a node, and its first place", () => {
    const diagram = parsed(`flowchart LR
    A --> B
    A[Named later] --> C
    B{Now a question}`)
    expect(titles(diagram)).toEqual({ A: "Named later", B: "Now a question", C: "C" })
    expect(shapes(diagram).B).toBe("diamond")
    expect(diagram.boxes.map((box) => box.key)).toEqual(["A", "B", "C"])
  })

  it("reports lines it cannot read, and an arrow to the same box", () => {
    const diagram = parsed(`flowchart LR
    A --> B
    A --> A
    this is not -> valid ][`)
    expect(pairs(diagram)).toEqual(["A>B"])
    expect(diagram.notes.join(" ")).toMatch(/itself/)
    expect(diagram.notes.join(" ")).toMatch(/Line 4 could not be read/)
  })

  it("reads an agent's architecture diagram", () => {
    const diagram = parsed(`graph TB
    subgraph Client
        UI[Web App]
        Mobile[Mobile App]
    end
    subgraph Backend
        API[API Gateway]
        Auth[Auth Service]
        Orders[Order Service]
    end
    subgraph Data
        DB[(PostgreSQL)]
        Cache[(Redis)]
        Queue[[Message Queue]]
    end
    UI --> API
    Mobile --> API
    API --> Auth
    API --> Orders
    Orders --> DB
    Orders -.-> Cache
    Orders -->|publishes| Queue
    Auth --> DB`)
    expect(diagram.groups.map((group) => group.title)).toEqual(["Client", "Backend", "Data"])
    expect(diagram.boxes).toHaveLength(8)
    expect(diagram.arrows).toHaveLength(8)
    expect(shapes(diagram).DB).toBe("cylinder")
  })

  it("reads GitHub's own README example", () => {
    const diagram = parsed(`graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;`)
    expect(diagram.boxes).toHaveLength(4)
    expect(diagram.notes).toEqual([])
  })
})

describe("sequence diagrams", () => {
  it("makes participants boxes and numbers the messages", () => {
    const diagram = parsed(`sequenceDiagram
    autonumber
    participant Alice
    actor Bob as Bob the builder
    Alice->>John: Hello John, how are you?
    loop Healthcheck
        John->>John: Fight against hypochondria
    end
    Note right of John: Rational thoughts <br/>prevail!
    John-->>Alice: Great!
    John->>Bob: How about you?
    Bob-->>John: Jolly good!
    Alice->>+John: And again?
    John-->>-Alice: Still great`)
    expect(diagram.kind).toBe("sequence")
    expect(diagram.boxes.map((box) => box.key)).toEqual(["Alice", "Bob", "John"])
    expect(titles(diagram).Bob).toBe("Bob the builder")
    expect(diagram.boxes.find((box) => box.key === "Bob")?.icon).toBe("user")
    expect(diagram.arrows.map((arrow) => [arrow.source, arrow.target, arrow.label, arrow.stroke])).toEqual([
      ["Alice", "John", "1. Hello John, how are you?, 5. And again?", "solid"],
      ["John", "Alice", "2. Great!, 6. Still great", "dotted"],
      ["John", "Bob", "3. How about you?", "solid"],
      ["Bob", "John", "4. Jolly good!", "dotted"],
    ])
    const notes = diagram.notes.join(" ")
    expect(notes).toMatch(/Loops/)
    expect(notes).toMatch(/itself/)
    expect(notes).toMatch(/Notes/)
    expect(notes).toMatch(/share one arrow/)
  })

  it("groups participants in a box, and reads every arrow", () => {
    const diagram = parsed(`sequenceDiagram
    box Purple Shop
    participant W as Web
    participant A as API
    end
    participant DB@{ "type": "database" }
    W->>A: GET /orders
    A-)DB: query
    DB--)A: rows
    A-xW: timeout
    W->A: plain line
    A<<->>W: both ways`)
    expect(diagram.groups).toEqual([{ key: "box-1", title: "Shop", parent: null }])
    expect(diagram.boxes.map((box) => [box.key, box.group])).toEqual([["W", "box-1"], ["A", "box-1"], ["DB", null]])
    expect(shapes(diagram).DB).toBe("cylinder")
    const between = (source: string, target: string) =>
      diagram.arrows.find((arrow) => arrow.source === source && arrow.target === target)!
    expect(between("A", "DB")).toMatchObject({ direction: "forward", stroke: "solid" })
    expect(between("DB", "A")).toMatchObject({ stroke: "dotted" })
    expect(between("W", "A").label).toBe("1. GET /orders, 5. plain line")
    expect(between("A", "W")).toMatchObject({ direction: "both", label: "4. timeout, 6. both ways" })
  })
})

describe("ER diagrams", () => {
  it("makes entities boxes with their attributes on a page, and relationships labelled arrows", () => {
    const diagram = parsed(`erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    CUSTOMER {
        string name
        string custNumber PK
        string sector "Retail or trade"
    }
    ORDER {
        int orderNumber PK
        string deliveryAddress FK, UK
        decimal(10,2) total
    }`)
    expect(diagram.kind).toBe("er")
    expect(diagram.boxes.map((box) => box.key)).toEqual(["CUSTOMER", "ORDER", "LINE-ITEM", "DELIVERY-ADDRESS"])
    expect(diagram.arrows.map((arrow) => [arrow.source, arrow.target, arrow.label, arrow.stroke])).toEqual([
      ["CUSTOMER", "ORDER", "places (1 to 0..*)", "solid"],
      ["ORDER", "LINE-ITEM", "contains (1 to 1..*)", "solid"],
      ["CUSTOMER", "DELIVERY-ADDRESS", "uses (1..* to 1..*)", "dotted"],
    ])
    const customer = diagram.boxes.find((box) => box.key === "CUSTOMER")!
    expect(customer.page?.markdown).toBe(
      [
        "| Attribute | Type | Key | Comment |",
        "| --- | --- | --- | --- |",
        "| name | string |  |  |",
        "| custNumber | string | PK |  |",
        "| sector | string |  | Retail or trade |",
      ].join("\n")
    )
    expect(diagram.boxes.find((box) => box.key === "ORDER")?.page?.markdown).toContain("| deliveryAddress | string | FK, UK |")
    expect(diagram.boxes.find((box) => box.key === "ORDER")?.page?.markdown).toContain("| total | decimal(10,2) |")
    expect(diagram.boxes.find((box) => box.key === "LINE-ITEM")?.page).toBeUndefined()
    expect(diagram.notes).toEqual([])
  })

  it("reads aliases, quoted labels, word cardinalities and a direction", () => {
    const diagram = parsed(`erDiagram
    direction LR
    p[Person] {
      string firstName
    }
    "Car Model" ["Model of a car"]
    p one or more to zero or many "Car Model" : "drives"`)
    expect(diagram.direction).toBe("LR")
    expect(titles(diagram)).toEqual({ p: "Person", "Car Model": "Model of a car" })
    expect(diagram.arrows[0]).toMatchObject({ source: "p", target: "Car Model", label: "drives (1..* to 0..*)" })
  })
})

describe("what is not drawn", () => {
  it("names the kinds of diagram it does not draw", () => {
    const result = parseMermaid("classDiagram\n  Animal <|-- Duck")
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/class diagram.*flowcharts/) })
    expect(parseMermaid("pie title Pets\n  \"Dogs\" : 386")).toMatchObject({ ok: false, error: expect.stringMatching(/pie chart/) })
  })

  it("refuses text that is not Mermaid", () => {
    expect(parseMermaid("Just some notes")).toMatchObject({ ok: false })
    expect(parseMermaid("")).toMatchObject({ ok: false })
    expect(parseMermaid("flowchart LR")).toMatchObject({ ok: false, error: expect.stringMatching(/no nodes/) })
  })
})

describe("telling Mermaid from other pasted text", () => {
  it("knows a diagram when it sees one", () => {
    expect(looksLikeMermaid("flowchart LR\n  A --> B")).toBe(true)
    expect(looksLikeMermaid("graph TD;\nA-->B;")).toBe(true)
    expect(looksLikeMermaid("sequenceDiagram\n  A->>B: hi")).toBe(true)
    expect(looksLikeMermaid("```mermaid\nerDiagram\n  A ||--o{ B : has\n```")).toBe(true)
    expect(looksLikeMermaid("classDiagram\n  A <|-- B")).toBe(true)
  })

  it("leaves other text alone", () => {
    expect(looksLikeMermaid("graph theory says a tree has n-1 edges")).toBe(false)
    expect(looksLikeMermaid("Box one\nBox two -> Box three: label")).toBe(false)
    expect(looksLikeMermaid("")).toBe(false)
  })
})
