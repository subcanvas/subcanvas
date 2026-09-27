# Subcanvas import test

# Architecture notes

This page checks that a Notion export comes into Subcanvas cleanly.

- Web app talks to the API
- API writes to Postgres
- [ ]  Draw the payments flow
- [ ]  Write the ledger README

> Every box should open into what is inside it.
> 

## Services

The API is **stateless** and the ledger is *append-only*. Config lives in `config.toml`.

1. Web app
2. API
3. Ledger

This line should come in red. 

[Ledger service](Subcanvas%20import%20test/Ledger%20service%203e8023511f5e808abfc3c81dea3ca1af.md)

[Payments service](Subcanvas%20import%20test/Payments%20service%203e8023511f5e80fabeb9c5ca6c9430d2.md)

Left column: the web app renders on the server. It is written in TypeScript. 

Right column: the ledger runs nightly.

![service-map.png](Subcanvas%20import%20test/service-map.png)

[Service catalog](Subcanvas%20import%20test/Service%20catalog%203e8023511f5e8047b424fc0bba802856.csv)

| Service | Owner | Language |
| --- | --- | --- |
| API | Platform | Go |
| Ledger | Finance | Rust |

[GitHub - subcanvas/subcanvas: Whiteboards and documents that nest inside each other. An open-source Notion/Excalidraw hybrid with real-time collaboration.](https://github.com/subcanvas/subcanvas)

$$
\sum_{i=1}^{n} x_i = \frac{n(n+1)}{2}
$$

```jsx
const api = createServer({ port: 8080 })
api.listen()
```

<aside>
💡

Arrows come from .subcanvas files.

- Why nested whiteboards
    
    A box that says Payments should open into how payments work.
    
</aside>