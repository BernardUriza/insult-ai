# web/ — Insult AI frontend (Next.js)

The UI/UX layer. Scaffold it (interactive, so run it yourself):

```bash
cd /Users/bernardurizaorozco/Documents/insult_ai
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --use-npm
```

## The "ideal user journey" to build (what wins per lablab judging)

1. **Input** — one field: paste a URL or a claim. Big, bold, single CTA.
2. **Live state** — "🕷️ scraping the web in real time…" while `/roast` runs
   (this is what visually SELLS the live-web-data angle to judges).
3. **Result** — the 🔥 roast, plus a side panel **🧾 Receipts** = the sources it
   actually fetched (proves Bright Data is doing real work).
4. Mobile-responsive (judges open links on their phones).

## Wiring

Call the FastAPI backend:

```ts
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/roast`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ target }),
});
const { roast, usage } = await res.json();
```

Set `NEXT_PUBLIC_API_URL` to the Azure Container App URL (or `http://localhost:8080` in dev).
Deploy this dir to **Azure Static Web Apps**.
