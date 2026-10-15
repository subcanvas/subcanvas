// The repository the playground opens on (app/try), drawn by the same
// import as a real one (lib/github/import-repository.ts). It is the shop the
// landing page's miniature shows: a web app and an API that both charge
// cards through Payments, which books every charge in a Ledger, with the
// inside of each written out in folders, READMEs and .subcanvas files.

export const EXAMPLE_REPOSITORY = { owner: "acme", name: "shop" }

export const EXAMPLE_FILES: Record<string, string> = {
  "README.md": `# Shop

An online shop: a web app and an API take orders, Payments charges cards, and the Ledger books every charge.

Every folder here is a box on the diagram. Double-click one to go inside it, or click an arrow to read what goes over it.
`,
  ".subcanvas": `title: acme/shop
description: An online shop. The web app and the API take orders, Payments charges cards, and the Ledger books every charge. Double-click a box to go inside it.
`,

  "web/README.md": `The storefront customers browse, the checkout where they pay, and sign-in.
`,
  "web/.subcanvas": `title: Web app
color: green
connects:
  - to: payments
    label: charges
    description: |
      The Pay button asks Payments to charge the card once the order is placed.

      The web app never sees the card number: the card form is the payment provider's, and only its token comes back.
`,
  "web/storefront/README.md": `Product pages and search. Cached at the edge, so it stays up when the API is slow.
`,
  "web/storefront/.subcanvas": `connects:
  - to: web/checkout
    label: add to cart
`,
  "web/checkout/README.md": `Cart, shipping address, then pay. Each step is its own page, so a refresh never loses the cart.
`,
  "web/checkout/.subcanvas": `color: green
connects:
  - to: web/sign-in
    label: needs
    description: A guest can fill the cart, but paying needs an account, so checkout sends them to sign in and back.
`,
  "web/checkout/cart/README.md": `Kept in the session until the order is placed. Prices are checked again at payment, so a stale cart never charges the old price.
`,
  "web/checkout/cart/.subcanvas": `connects:
  - to: web/checkout/shipping-address
    label: next
`,
  "web/checkout/shipping-address/README.md": `Checked by the API before an order exists, so a bad address never reaches Payments.
`,
  "web/checkout/shipping-address/.subcanvas": `title: Shipping address
connects:
  - to: web/checkout/pay-button
    label: before
`,
  "web/checkout/pay-button/README.md": `Disabled while a charge is in flight, so a double click is one charge.
`,
  "web/checkout/pay-button/.subcanvas": `title: Pay button
color: blue
`,
  "web/sign-in/README.md": `Sessions last 30 days. The API checks the same cookie, so one sign-in covers both.
`,
  "web/sign-in/.subcanvas": `title: Sign-in
`,

  "api/README.md": `REST for the mobile apps and partners. Same orders, same rules as the web app.
`,
  "api/.subcanvas": `title: API
color: blue
connects:
  - to: payments
    label: gRPC
    description: |
      \`Payments.Charge\`, with the order id as the idempotency key.

      A retried call returns the first charge instead of making a second one.
`,
  "api/routes/README.md": `REST under /v1. Each route checks the session first, then the person's role.
`,
  "api/routes/.subcanvas": `color: purple
connects:
  - to: api/orders
`,
  "api/orders/README.md": `Creates an order from a cart, and moves it through paid, shipped and delivered.
`,
  "api/orders/.subcanvas": `connects:
  - to: api/database
    label: reads, writes
`,
  "api/database/README.md": `Postgres. Orders, customers and addresses. Money lives in the Ledger, not here.
`,
  "api/database/.subcanvas": `color: blue
shape: cylinder
`,

  "payments/README.md": `Charges cards through the payment provider and owns the charges table.

## What it promises

- One charge per order, however many times it is asked.
- Every settled charge becomes a journal entry in the Ledger.
- A failed charge is never retried without the customer.
`,
  "payments/.subcanvas": `connects:
  - to: ledger
    label: journal entry
    description: |
      Posts a journal entry for every settled charge.

      The call is idempotent on the charge id, so a retry never books a charge twice.
`,

  "ledger/README.md": `Double-entry bookkeeping. Every movement of money is two rows that sum to zero.
`,
  "ledger/.subcanvas": `color: orange
`,
  "ledger/journal/README.md": `The rows themselves. Nothing is ever updated or deleted: a mistake is fixed by a new entry that reverses it.
`,
  "ledger/journal/.subcanvas": "",
  "ledger/reconcile/README.md": `Runs every night. Matches the payment provider's payouts to journal entries and flags anything a cent off.
`,
  "ledger/reconcile/.subcanvas": `color: orange
connects:
  - to: ledger/journal
    label: reads
  - to: ledger/reports
`,
  "ledger/reports/README.md": `Monthly revenue, refunds and fees, read straight from the journal.
`,
  "ledger/reports/.subcanvas": "",
}
