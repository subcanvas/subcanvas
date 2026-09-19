---
layout: home
---
<p align="center"><img src="docs/logo.png" width="120" alt="Shop"></p>

# Shop

[![build](https://img.shields.io/badge/build-passing-green.svg)](https://example.com/ci)

Shop is a small, complete example of an online store, split into services the way a real one would be.

## Layout

- [`apps/web`](apps/web): the storefront
- [`services/payments`](./services/payments/README.md): card payments
- [Architecture decisions](docs/adr)

![How an order flows](docs/order-flow.png)

```sh
make dev
```

> Everything here is made up.

| Service | Port |
|---|---|
| [payments](services/payments) | 7001 |
| ledger | 7002 |
