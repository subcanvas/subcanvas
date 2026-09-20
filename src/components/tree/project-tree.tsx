"use client"

import {
  ChevronRight,
  ClipboardPaste,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createDocument,
  createFolder,
  deleteFolder,
  listReferences,
  moveItem,
  renameItem,
  trashDocument,
  type ActionResult,
  type ProjectRef,
} from "@/app/[org]/[project]/tree-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { pickedFromDrop, type PickedFile } from "@/lib/import/picked"
import { cn } from "@/lib/utils"
import { pathTo, type Container, type DocumentType, type TreeNode } from "@/lib/tree"

import type { ImportTarget } from "./import-dialog"

// Loaded when first opened: reading zips and planning an import is code
// that most visits to a project never need.
const ImportDialog = dynamic(() => import("./import-dialog").then((module) => module.ImportDialog), { ssr: false })
const PasteMarkdownDialog = dynamic(
  () => import("./paste-markdown-dialog").then((module) => module.PasteMarkdownDialog),
  { ssr: false }
)

const DRAG_TYPE = "application/x-subcanvas-item"
type Dragged = { kind: "folder" | "document"; id: string }
// What a drag from the desktop carries: files, folders, a zip.
const FILES_TYPE = "Files"
const carries = (event: React.DragEvent) =>
  event.dataTransfer.types.includes(DRAG_TYPE) || event.dataTransfer.types.includes(FILES_TYPE)

export function ProjectTree({
  project,
  projectName,
  nodes,
  canEdit,
  canUpgrade,
  trashHref,
}: {
  project: ProjectRef
  projectName: string
  // Where this project's trash is. A public visitor has none.
  trashHref?: string
  nodes: TreeNode[]
  canEdit: boolean
  // Whether this server has a paid plan to offer when the limit is hit.
  canUpgrade: boolean
}) {
  const router = useRouter()
  const params = useParams<{ docId?: string }>()
  const activeId = params.docId ?? null
  const [, startTransition] = useTransition()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // A document that is linked from elsewhere, waiting for confirmation.
  const [confirmTrash, setConfirmTrash] = useState<{
    id: string
    name: string
    references: string[]
  } | null>(null)
  // An open import or paste dialog. The key makes each opening a fresh one.
  const [bringingIn, setBringingIn] = useState<{
    key: number
    how: "import" | "paste"
    target: ImportTarget
    dropped: Promise<PickedFile[]> | null
  } | null>(null)

  // Reveal the open document.
  const activePath = useMemo(
    () => (activeId ? pathTo(nodes, activeId) : null),
    [nodes, activeId]
  )
  const visibleExpanded = useMemo(
    () => new Set([...expanded, ...(activePath ?? [])]),
    [expanded, activePath]
  )

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      // Collapsing the path to the open document is allowed; it re-opens
      // only when the open document changes.
      if (visibleExpanded.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function run(action: () => Promise<ActionResult | void>, onOk?: (result: ActionResult) => void) {
    startTransition(async () => {
      const result = await action()
      if (result && "error" in result)
        toast.error(
          result.error,
          result.limit && canUpgrade
            ? {
                action: {
                  label: "Upgrade",
                  onClick: () => router.push(`/${project.slug}/settings/billing`),
                },
              }
            : undefined
        )
      else if (result) onOk?.(result)
    })
  }

  function create(type: DocumentType | "folder", container: Container) {
    if (container.kind !== "root")
      setExpanded((current) => new Set(current).add(container.id))

    if (type === "folder")
      run(
        () => createFolder(project, container.kind === "folder" ? container.id : null),
        (result) => {
          const id = (result as { id?: string }).id
          if (id) setRenamingId(id)
        }
      )
    else run(() => createDocument(project, type, container))
  }

  function trash(id: string) {
    run(
      () => trashDocument(project, id),
      () => {
        toast.success("Moved to trash.")
        // Leave the page if it, or something it contains, was open.
        if (id === activeId || activePath?.includes(id))
          router.push(`/${project.slug}/${project.projectId}`)
      }
    )
  }

  // Warn first when other documents link to this one (R1.8).
  function requestTrash(id: string, name: string) {
    startTransition(async () => {
      const references = await listReferences(id)
      if (references.length) setConfirmTrash({ id, name, references })
      else trash(id)
    })
  }

  function bringIn(how: "import" | "paste", container: Container, name: string, dropped: Promise<PickedFile[]> | null = null) {
    if (container.kind !== "root") setExpanded((current) => new Set(current).add(container.id))
    setBringingIn((current) => ({ key: (current?.key ?? 0) + 1, how, target: { container, name }, dropped }))
  }

  function drop(event: React.DragEvent, target: Container, name: string) {
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    const raw = event.dataTransfer.getData(DRAG_TYPE)
    // Files from the desktop are an import into where they were dropped.
    if (!raw && event.dataTransfer.types.includes(FILES_TYPE))
      return bringIn("import", target, name, pickedFromDrop(event.dataTransfer))
    if (!raw) return
    const dragged = JSON.parse(raw) as Dragged
    if (target.kind !== "root") setExpanded((current) => new Set(current).add(target.id))
    run(() => moveItem(project, dragged.kind, dragged.id, target))
  }

  function renderNode(node: TreeNode, depth: number) {
    const isOpen = visibleExpanded.has(node.id)
    const container: Container = { kind: node.kind, id: node.id }
    const href = `/${project.slug}/${project.projectId}/d/${node.id}`
    const Icon =
      node.kind === "folder" ? Folder : node.type === "whiteboard" ? Workflow : FileText
    const expandable = node.kind === "folder" || node.children.length > 0

    const dragProps = canEdit
      ? {
          draggable: renamingId !== node.id,
          onDragStart: (event: React.DragEvent) => {
            event.stopPropagation()
            event.dataTransfer.setData(
              DRAG_TYPE,
              JSON.stringify({ kind: node.kind, id: node.id } satisfies Dragged)
            )
            event.dataTransfer.effectAllowed = "move"
          },
          onDragOver: (event: React.DragEvent) => {
            if (!carries(event)) return
            event.preventDefault()
            event.stopPropagation()
            setDropTarget(node.id)
          },
          onDragLeave: () => setDropTarget((current) => (current === node.id ? null : current)),
          onDrop: (event: React.DragEvent) => drop(event, container, node.name),
        }
      : {}

    const label =
      renamingId === node.id ? (
        <RenameInput
          initial={node.name}
          onDone={(name) => {
            setRenamingId(null)
            if (name !== null && name !== node.name)
              run(() => renameItem(project, node.kind, node.id, name))
          }}
        />
      ) : (
        <span className="truncate">{node.name}</span>
      )

    return (
      <SidebarMenuItem key={node.id}>
        <div
          {...dragProps}
          className={cn(
            "flex items-center rounded-md",
            dropTarget === node.id && "bg-sidebar-accent ring-1 ring-sidebar-ring"
          )}
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isOpen}
            onClick={() => toggle(node.id)}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
              !expandable && "invisible"
            )}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
          </button>

          {node.kind === "folder" ? (
            <SidebarMenuButton onClick={() => toggle(node.id)} className="pr-7">
              <Icon className="text-graphite" />
              {label}
            </SidebarMenuButton>
          ) : renamingId === node.id ? (
            <SidebarMenuButton render={<div />} className="pr-7">
              <Icon />
              {label}
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              isActive={node.id === activeId}
              render={<Link href={href} draggable={false} />}
              className="pr-7 data-active:font-medium data-active:shadow-[inset_2px_0_0_0_var(--cobalt)]"
            >
              <Icon className={node.type === "whiteboard" ? "text-cobalt" : "text-graphite"} />
              {label}
            </SidebarMenuButton>
          )}
        </div>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction showOnHover aria-label={`Actions for ${node.name}`}>
                  <MoreHorizontal />
                </SidebarMenuAction>
              }
            />
            <DropdownMenuContent align="start" className="min-w-52">
              <CreateItems
                inside
                allowFolder={node.kind === "folder"}
                onCreate={(type) => create(type, container)}
                onBringIn={(how) => bringIn(how, container, node.name)}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRenamingId(node.id)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  node.kind === "folder"
                    ? run(() => deleteFolder(project, node.id))
                    : requestTrash(node.id, node.name)
                }
              >
                <Trash2 />
                {node.kind === "folder" ? "Delete folder" : "Move to trash"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isOpen && node.children.length > 0 && (
          <SidebarMenu
            className="relative before:absolute before:top-0 before:bottom-1 before:left-(--guide) before:w-px before:bg-rule"
            style={{ ["--guide" as string]: `${depth * 12 + 10}px` }}
          >
            {node.children.map((child) => renderNode(child, depth + 1))}
          </SidebarMenu>
        )}
        {isOpen && node.kind === "folder" && node.children.length === 0 && (
          <p
            className="py-1 text-xs text-muted-foreground"
            style={{ paddingLeft: (depth + 1) * 12 + 28 }}
          >
            Empty
          </p>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarGroup
      className="flex-1"
      onDragOver={(event) => {
        if (!canEdit || !carries(event)) return
        event.preventDefault()
        setDropTarget("root")
      }}
      onDragLeave={() => setDropTarget((current) => (current === "root" ? null : current))}
      onDrop={(event) => canEdit && drop(event, { kind: "root" }, projectName)}
    >
      {bringingIn?.how === "import" && (
        <ImportDialog
          key={bringingIn.key}
          project={project}
          target={bringingIn.target}
          dropped={bringingIn.dropped}
          canUpgrade={canUpgrade}
          onClose={() => setBringingIn(null)}
        />
      )}
      {bringingIn?.how === "paste" && (
        <PasteMarkdownDialog
          key={bringingIn.key}
          project={project}
          target={bringingIn.target}
          canUpgrade={canUpgrade}
          onClose={() => setBringingIn(null)}
        />
      )}
      <Dialog open={confirmTrash !== null} onOpenChange={(open) => !open && setConfirmTrash(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move “{confirmTrash?.name}” to the trash?</DialogTitle>
            <DialogDescription>
              It is linked from {confirmTrash?.references.length === 1 ? "another document" : "other documents"}.
              Those links will show it as trashed until you restore it.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-sm">
            {confirmTrash?.references.map((title, index) => <li key={index}>{title}</li>)}
          </ul>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmTrash) trash(confirmTrash.id)
                setConfirmTrash(null)
              }}
            >
              Move to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SidebarGroupLabel className="h-auto py-1 pr-14 font-heading text-[15px] font-semibold text-ink">
        <span className="truncate">{projectName}</span>
      </SidebarGroupLabel>
      {/* What is rarely needed lives here, not in a row of its own. */}
      {trashHref && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarGroupAction aria-label="Project menu" className={cn(canEdit && "right-9")}>
                <MoreHorizontal />
              </SidebarGroupAction>
            }
          />
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem render={<Link href={trashHref} />}>
              <Trash2 />
              Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarGroupAction aria-label="Add to project">
                <Plus />
              </SidebarGroupAction>
            }
          />
          <DropdownMenuContent align="start" className="min-w-52">
            <CreateItems
              allowFolder
              onCreate={(type) => create(type, { kind: "root" })}
              onBringIn={(how) => bringIn(how, { kind: "root" }, projectName)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <SidebarGroupContent
        className={cn("min-h-24 flex-1 rounded-md", dropTarget === "root" && "bg-sidebar-accent/50")}
      >
        {nodes.length ? (
          <SidebarMenu>{nodes.map((node) => renderNode(node, 0))}</SidebarMenu>
        ) : (
          <p className="px-2 py-1 text-sm leading-relaxed text-graphite">
            {canEdit ? "No documents yet. Use + to add a whiteboard or a page of notes, or drop Markdown files here." : "No documents yet."}
          </p>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function CreateItems({
  inside = false,
  allowFolder,
  onCreate,
  onBringIn,
}: {
  inside?: boolean
  allowFolder: boolean
  onCreate: (type: DocumentType | "folder") => void
  onBringIn: (how: "import" | "paste") => void
}) {
  const suffix = inside ? " inside" : ""
  return (
    <>
      <DropdownMenuItem onClick={() => onCreate("text")}>
        <FileText />
        New text document{suffix}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onCreate("whiteboard")}>
        <Workflow />
        New whiteboard{suffix}
      </DropdownMenuItem>
      {allowFolder && (
        <DropdownMenuItem onClick={() => onCreate("folder")}>
          <FolderPlus />
          New folder{suffix}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onBringIn("import")}>
        <FileUp />
        Import files{suffix}…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onBringIn("paste")}>
        <ClipboardPaste />
        Paste Markdown{suffix}…
      </DropdownMenuItem>
    </>
  )
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string
  onDone: (name: string | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    // The menu that started the rename returns focus to its trigger as it
    // closes, so focus is taken a moment later.
    const timer = setTimeout(() => ref.current?.select(), 50)
    return () => clearTimeout(timer)
  }, [])

  function finish(name: string | null) {
    if (done.current) return
    done.current = true
    onDone(name?.trim() ? name.trim() : null)
  }

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Name"
      maxLength={120}
      className="min-w-0 flex-1 rounded-sm bg-background px-1 outline-none ring-1 ring-ring"
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => finish(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value)
        if (event.key === "Escape") finish(null)
      }}
    />
  )
}
