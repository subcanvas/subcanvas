import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness"
import * as Y from "yjs"

import type { Database } from "@/lib/supabase/database.types"

import { fromBase64, fromBytea, toBase64, toBytea } from "./encoding"

// Syncs one Y.Doc over a private Supabase Realtime channel and persists it
// to Postgres. See docs/ARCHITECTURE.md, section 4.
//
// Broadcast is fast but not guaranteed, so there are safety nets:
//  - On join, a client broadcasts its state vector. Peers reply with what it
//    is missing, and ask for the reverse if it has something they lack.
//  - Yjs parks updates whose predecessors never arrived. When that happens
//    the client knows it has a gap and re-reads the database.
//  - Every client re-reads the database after joining, after reconnecting,
//    and on a slow timer while the tab is visible. Viewers cannot broadcast,
//    so this is their only catch-up path.

// Realtime bills every message sent and every copy delivered, so edits are
// batched. 100 ms is below what anyone notices.
const BROADCAST_DELAY_MS = 100
const PERSIST_DELAY_MS = 1000
const PERSIST_RETRY_MS = 5000
// Covers a peer's persist delay: edits broadcast just before we joined are
// in the database by the time we look again.
const SECOND_LOAD_DELAY_MS = PERSIST_DELAY_MS + 1500
const BACKSTOP_LOAD_MS = 30_000
// Viewers hold no Realtime connection. They re-read the document this often.
const VIEWER_POLL_MS = 20_000
const COMPACT_AFTER_ROWS = 200
// Base64 characters per Realtime message. Larger updates are split.
const CHUNK_SIZE = 100_000

export type SyncStatus = "connecting" | "connected" | "disconnected"
export type SaveStatus = "saved" | "saving" | "error"

// Who is in the document, from Realtime presence. Viewers appear too: the
// channel lets every member publish presence, though only editors broadcast.
export type Peer = { id: string; name: string; color: string }

type Listener = () => void
type UpdateMessage = { id: string; i: number; n: number; d: string }

export class SupabaseProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness

  status: SyncStatus = "connecting"
  // True once the database has been read. Editors wait for this so they
  // never open on an empty document that fills in a moment later.
  loaded = false
  saveStatus: SaveStatus = "saved"
  // Other people in the document, one entry per person however many tabs
  // they have open. A new array on every change, for useSyncExternalStore.
  peers: Peer[] = []
  // People watching without editing, from heartbeats. Approximate.
  viewers = 0

  private me: Peer | null = null
  // Other connections on the channel, counting a second tab of the same
  // person. Zero means nobody would receive a broadcast.
  private otherConnections = 0
  private readonly sessionId = crypto.randomUUID()

  private channel: RealtimeChannel
  private listeners = new Set<Listener>()
  private destroyed = false

  private lastUpdateId = 0
  private snapshotSeenAt: string | null = null
  private loading: Promise<void> | null = null
  private secondLoadTimer: ReturnType<typeof setTimeout> | null = null
  private backstopTimer: ReturnType<typeof setInterval>

  private toBroadcast: Uint8Array[] = []
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null
  private toPersist: Uint8Array[] = []
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private persisting = false

  private chunks = new Map<string, { parts: string[]; received: number }>()

  constructor(
    private supabase: SupabaseClient<Database>,
    readonly documentId: string,
    // Viewers receive updates and never send or persist. The database and
    // the channel enforce this too; the flag only avoids pointless attempts.
    readonly readOnly: boolean
  ) {
    this.doc = new Y.Doc()
    this.awareness = new Awareness(this.doc)

    this.doc.on("update", this.onDocUpdate)
    this.awareness.on("update", this.onAwarenessUpdate)
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onPageHide)
      window.addEventListener("offline", this.onOffline)
      window.addEventListener("online", this.onOnline)
      document.addEventListener("visibilitychange", this.onVisibilityChange)
    }

    this.channel = supabase.channel(`doc:${documentId}`, {
      config: { private: true, broadcast: { self: false } },
    })
    this.channel
      .on("broadcast", { event: "update" }, ({ payload }) =>
        this.onRemoteUpdate(payload as UpdateMessage)
      )
      .on("broadcast", { event: "sync-request" }, ({ payload }) =>
        this.onSyncRequest(payload as { sv: string })
      )
      .on("broadcast", { event: "awareness" }, ({ payload }) =>
        applyAwarenessUpdate(this.awareness, fromBase64((payload as { d: string }).d), this)
      )
      .on("presence", { event: "sync" }, this.onPresenceSync)

    this.backstopTimer = setInterval(
      () => {
        if (document.visibilityState !== "visible") return
        if (this.readOnly || this.status === "connected") void this.load()
      },
      this.readOnly ? VIEWER_POLL_MS : BACKSTOP_LOAD_MS
    )

    void this.connect()
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Announces this person to everyone else in the document.
  setUser(user: Peer) {
    const changed =
      this.me?.id !== user.id || this.me.name !== user.name || this.me.color !== user.color
    this.me = user
    if (changed && this.status === "connected") this.track()
  }

  // Every connection announces itself, named or not, so others know a
  // broadcast has somewhere to go.
  private track() {
    if (this.readOnly) return
    void this.channel.track({ ...(this.me ?? {}), session: this.sessionId })
  }

  private onPresenceSync = () => {
    const seen = new Map<string, Peer>()
    let connections = 0
    for (const entries of Object.values(this.channel.presenceState<Peer & { session?: string }>()))
      for (const { id, name, color, session } of entries) {
        if (session !== this.sessionId) connections++
        if (typeof id === "string" && id !== this.me?.id && !seen.has(id))
          seen.set(id, { id, name: String(name ?? ""), color: String(color ?? "") })
      }
    this.otherConnections = connections

    const next = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id))
    const same =
      next.length === this.peers.length &&
      next.every((peer, i) => peer.id === this.peers[i].id && peer.name === this.peers[i].name)
    if (same) return
    this.peers = next
    this.emit()
  }

  destroy() {
    if (this.destroyed) return
    this.flush()
    this.destroyed = true

    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy")
    this.doc.off("update", this.onDocUpdate)
    this.awareness.off("update", this.onAwarenessUpdate)
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHide)
      window.removeEventListener("offline", this.onOffline)
      window.removeEventListener("online", this.onOnline)
      document.removeEventListener("visibilitychange", this.onVisibilityChange)
    }
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer)
    if (this.secondLoadTimer) clearTimeout(this.secondLoadTimer)
    clearInterval(this.backstopTimer)

    void this.supabase.removeChannel(this.channel)
    this.awareness.destroy()
    this.doc.destroy()
    this.listeners.clear()
  }

  // Connection ---------------------------------------------------------------

  private async connect() {
    // Read the database without waiting for the channel, so the document
    // opens even when Realtime is unreachable.
    void this.load()

    // Viewers stop here: no socket, no messages. They poll instead.
    if (this.readOnly) return

    await this.supabase.realtime.setAuth()
    if (this.destroyed) return

    // Also fires again after every automatic rejoin.
    this.channel.subscribe((state) => {
      if (this.destroyed) return
      if (state === "SUBSCRIBED") void this.onJoined()
      else this.setStatus("disconnected")
    })
  }

  private async onJoined() {
    // Joined before loading, so nothing broadcast from here on is missed.
    await this.load()
    if (this.destroyed) return
    this.setStatus("connected")
    this.track()

    if (!this.readOnly) {
      void this.send("sync-request", {
        sv: toBase64(Y.encodeStateVector(this.doc)),
      })
      if (this.awareness.getLocalState() !== null)
        this.broadcastAwareness([this.doc.clientID])
    }

    if (this.secondLoadTimer) clearTimeout(this.secondLoadTimer)
    this.secondLoadTimer = setTimeout(() => void this.load(), SECOND_LOAD_DELAY_MS)
  }

  // Loading --------------------------------------------------------------------

  private load() {
    this.loading ??= this.loadFromDatabase().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async loadFromDatabase() {
    // Updates first, snapshot second. If a compaction lands in between, the
    // snapshot read afterwards already contains the rows it deleted.
    const { data: rows, error: rowsError } = await this.supabase
      .from("document_updates")
      .select("id, update")
      .eq("document_id", this.documentId)
      .gt("id", this.lastUpdateId)
      .order("id")
    const { data: snapshot, error: snapshotError } = await this.supabase
      .from("document_snapshots")
      .select("state, updated_at")
      .eq("document_id", this.documentId)
      .maybeSingle()

    if (this.destroyed) return
    if (rowsError || snapshotError) {
      if (!this.loaded) setTimeout(() => void this.load(), PERSIST_RETRY_MS)
      return
    }

    const updates: Uint8Array[] = []
    if (snapshot && snapshot.updated_at !== this.snapshotSeenAt) {
      updates.push(fromBytea(snapshot.state))
      this.snapshotSeenAt = snapshot.updated_at
    }
    for (const row of rows) updates.push(fromBytea(row.update))
    if (rows.length) this.lastUpdateId = rows[rows.length - 1].id

    if (updates.length) Y.applyUpdate(this.doc, Y.mergeUpdates(updates), this)

    if (!this.loaded) {
      this.loaded = true
      this.emit()
    }
    if (this.readOnly) this.setStatus("connected")
    void this.refreshViewers()

    if (!this.readOnly && rows.length > COMPACT_AFTER_ROWS) void this.compact()
  }

  // A viewer's refresh doubles as its heartbeat. Editors only ask for the count.
  private async refreshViewers() {
    const { data } = this.readOnly
      ? await this.supabase.rpc("viewer_heartbeat", {
          p_document_id: this.documentId,
          p_session_id: this.sessionId,
        })
      : await this.supabase.rpc("viewer_count", { p_document_id: this.documentId })
    if (this.destroyed || typeof data !== "number" || data === this.viewers) return
    this.viewers = data
    this.emit()
  }

  private async compact() {
    // The state holds everything up to lastUpdateId (and possibly more,
    // which is harmless: updates are idempotent).
    await this.supabase.rpc("compact_document", {
      p_document_id: this.documentId,
      p_state: toBytea(Y.encodeStateAsUpdate(this.doc)),
      p_up_to_id: this.lastUpdateId,
    })
  }

  // Local changes ----------------------------------------------------------------

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.readOnly) return

    // Alone in the document, a broadcast reaches nobody and still costs a
    // message. Whoever joins next catches up from the database and from the
    // state-vector exchange.
    if (this.otherConnections > 0) {
      this.toBroadcast.push(update)
      this.broadcastTimer ??= setTimeout(this.flushBroadcast, BROADCAST_DELAY_MS)
    }

    this.toPersist.push(update)
    this.setSaveStatus("saving")
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void this.persist(), PERSIST_DELAY_MS)
  }

  private flushBroadcast = () => {
    this.broadcastTimer = null
    if (!this.toBroadcast.length) return
    const update = Y.mergeUpdates(this.toBroadcast)
    this.toBroadcast = []
    this.broadcastUpdate(update)
  }

  private broadcastUpdate(update: Uint8Array) {
    const data = toBase64(update)
    const id = crypto.randomUUID()
    const n = Math.ceil(data.length / CHUNK_SIZE)
    for (let i = 0; i < n; i++)
      void this.send("update", {
        id,
        i,
        n,
        d: data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      } satisfies UpdateMessage)
  }

  private async persist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
    if (this.persisting || !this.toPersist.length) return

    this.persisting = true
    const batch = this.toPersist
    this.toPersist = []

    const { error } = await this.supabase
      .from("document_updates")
      .insert({ document_id: this.documentId, update: toBytea(Y.mergeUpdates(batch)) })

    this.persisting = false
    if (this.destroyed) return

    if (error) {
      // Keep the edits and try again; they are still in the local document.
      this.toPersist = [...batch, ...this.toPersist]
      this.setSaveStatus("error")
      this.persistTimer = setTimeout(() => void this.persist(), PERSIST_RETRY_MS)
    } else if (this.toPersist.length) {
      void this.persist()
    } else {
      this.setSaveStatus("saved")
    }
  }

  // Sends anything pending right away. Used when the page is hidden or closed.
  private flush = () => {
    if (this.destroyed || this.readOnly) return
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer)
      this.flushBroadcast()
    }
    void this.persist()
  }

  // The socket takes up to a minute to notice a dropped network. The browser
  // knows at once, so the status follows it.
  private onOffline = () => this.setStatus("disconnected")

  private onOnline = () => {
    if (this.destroyed) return
    if (this.readOnly || this.channel.state === "joined") this.setStatus("connected")
    void this.persist()
    void this.load()
  }

  // Say goodbye on the way out, so peers drop this person's avatar and
  // cursor now instead of when the socket times out.
  private onPageHide = () => {
    this.flush()
    if (this.destroyed || this.readOnly || this.status !== "connected") return
    removeAwarenessStates(this.awareness, [this.doc.clientID], "pagehide")
    void this.channel.untrack()
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") this.flush()
  }

  // Remote changes ---------------------------------------------------------------

  private applyRemote(update: Uint8Array) {
    Y.applyUpdate(this.doc, update, this)
    // Parked structs mean an earlier update from that peer never arrived.
    if (this.doc.store.pendingStructs) void this.load()
  }

  private onRemoteUpdate({ id, i, n, d }: UpdateMessage) {
    if (n === 1) {
      this.applyRemote(fromBase64(d))
      return
    }

    const entry = this.chunks.get(id) ?? { parts: new Array<string>(n), received: 0 }
    if (entry.parts[i] === undefined) entry.received++
    entry.parts[i] = d
    this.chunks.set(id, entry)

    if (entry.received === n) {
      this.chunks.delete(id)
      this.applyRemote(fromBase64(entry.parts.join("")))
    }
    // A chunk that never arrives leaves a partial entry behind. The next
    // database load recovers the content, so partial entries are dropped then.
    if (this.chunks.size > 32) this.chunks.clear()
  }

  private onSyncRequest({ sv }: { sv: string }) {
    if (this.readOnly) return
    const theirs = fromBase64(sv)
    const diff = Y.encodeStateAsUpdate(this.doc, theirs)
    // An empty diff is two bytes. Replies are jittered so a room of peers
    // does not answer all at once.
    if (diff.length > 2)
      setTimeout(() => {
        if (!this.destroyed) this.broadcastUpdate(diff)
      }, Math.random() * 300)
    if (this.awareness.getLocalState() !== null)
      this.broadcastAwareness([this.doc.clientID])

    // If they hold edits we lack (made while offline, say), ask in return.
    const mine = Y.decodeStateVector(Y.encodeStateVector(this.doc))
    for (const [client, clock] of Y.decodeStateVector(theirs))
      if ((mine.get(client) ?? 0) < clock) {
        void this.send("sync-request", {
          sv: toBase64(Y.encodeStateVector(this.doc)),
        })
        break
      }
  }

  // Awareness (carets and selections) -----------------------------------------

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this || this.readOnly || this.otherConnections === 0) return
    this.broadcastAwareness([...added, ...updated, ...removed])
  }

  private broadcastAwareness(clients: number[]) {
    void this.send("awareness", {
      d: toBase64(encodeAwarenessUpdate(this.awareness, clients)),
    })
  }

  // Helpers -------------------------------------------------------------------------

  private async send(event: string, payload: Record<string, unknown>) {
    if (this.status !== "connected" && event !== "sync-request") return
    await this.channel.send({ type: "broadcast", event, payload })
  }

  private setStatus(status: SyncStatus) {
    if (this.status === status) return
    this.status = status
    this.emit()
  }

  private setSaveStatus(saveStatus: SaveStatus) {
    if (this.saveStatus === saveStatus) return
    this.saveStatus = saveStatus
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }
}
