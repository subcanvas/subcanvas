// Stands in for the `server-only` package under Vitest. The real one throws
// when it is loaded outside a server build, which is its whole job in the
// app, and which a unit test of server code is by definition.
export {}
