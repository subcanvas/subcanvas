# Contributing

Thank you for looking. Subcanvas is young, and the most useful things you can do right now are to use it and say what goes wrong.

## Issues and ideas: welcome

- **Something broke?** Open a bug report. Say what you did, what you expected, and what happened, and include the browser and whether it was subcanvas.app or a copy you run.
- **An idea?** Open a feature request, starting with the problem it solves.
- **A security problem?** Do not open an issue. Email security@subcanvas.app ([SECURITY.md](SECURITY.md)).

## Code: not accepted yet

Pull requests with code are not being merged for now, while the terms for outside contributions are settled. Subcanvas is licensed under the AGPL-3.0 and is also run as a paid service, and how contributed code is licensed has to be decided once, before the first contribution lands, not after. This section will change when it is.

Fixes to typos and broken links in the docs are the exception: send them.

## Running it

The [README](README.md) has the development setup, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) how to run your own copy. Before a change is ready:

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm db:test
pnpm test:e2e   # a browser, against a real build and the local stack
```

Anything that changes the interface should be tried in a real browser, in the light and the dark theme.
