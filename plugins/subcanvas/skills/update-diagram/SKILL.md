---
description: Review a Subcanvas diagram against the code on this branch and bring it up to date, asking before removing anything.
argument-hint: "[whiteboard address or title]"
disable-model-invocation: true
---

Bring a Subcanvas diagram up to date with the code you are working in. Load the `subcanvas:diagrams` skill first and follow it. The whiteboard, if the person named one: $ARGUMENTS

1. Find the whiteboard: from its address (`open_address` gives its id), its title in `get_project`, or by asking. Read it with `read_whiteboard`, and read the whiteboards and pages nested inside it that the code touches.
2. Read the code it describes, and on a branch, what the branch changes (`git diff` against the branch it will merge into).
3. Compare, and list what is wrong: parts that are missing or gone, arrows that are missing, wrong, or labeled wrong, titles that no longer match the names in the code, and pages that say something no longer true.
4. Fix what only adds or corrects: add the missing boxes and arrows, retitle and relabel in place with `update_nodes` and `update_edges`, and correct pages block by block. Add new nodes with `near_node_id`; use `arrange_nodes` only on a whiteboard you drew yourself.
5. Do not delete or move anything yet. Show the person what you would delete or rearrange and why, and do it only after they agree.
6. Report what you changed, with the whiteboard's address, and what is waiting for their answer.
