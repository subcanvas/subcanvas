---
description: Map this repository as a nested Subcanvas whiteboard, with its parts as boxes, how they talk as arrows, and a page behind each arrow.
argument-hint: "[what to focus on, or where to put it]"
disable-model-invocation: true
---

Map the repository you are working in as a Subcanvas diagram. Load the `subcanvas:diagrams` skill first and follow it. The person added: $ARGUMENTS

1. Read the code first: the top-level layout, the services, apps or packages, what each one is for, and how they talk to each other (HTTP calls, queues, a shared database, imports). Note the files that show each connection.
2. Find where it goes. Use the workspace and project the person named; otherwise ask, offering to create a project named after the repository with `create_project`. If a whiteboard for this repository is already there, read it and add to it rather than starting another.
3. Draw the top whiteboard: a box for each main part (about a dozen at most) and arrows with short labels for how they talk. Then `arrange_nodes`, and after it a text node above the boxes saying what the repository is in a sentence or two.
4. Put a page behind each arrow saying what crosses it, in which format, who starts it, and where in the code it happens.
5. For each part with structure worth seeing, put a whiteboard inside its box and draw its parts there the same way. Give a part without inner structure a page instead: what it does, and where its code is.
6. Give the person the address of the top whiteboard and a short account of what is where.
