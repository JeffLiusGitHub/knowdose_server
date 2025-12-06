# KnowDose Backend (server/)

TypeScript + Express backend to keep API keys and data access on the server side. Exposes REST endpoints for AI (Gemini) and medication storage.

## Quick start

```bash
cd server
cp .env.example .env   # fill values
yarn install
yarn dev               # runs on PORT (default 4000)
```

## Environment

| Key | Description |
| --- | --- |
| `PORT` | Server port (default 4000) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `FIREBASE_PROJECT_ID` | Firebase project id (for Firestore via admin SDK) |
| `FIREBASE_CLIENT_EMAIL` | Service account client_email |
| `FIREBASE_PRIVATE_KEY` | Service account private_key (keep quotes, use `\n` for newlines) |

You can use a Firebase service account JSON and map the fields above.

## API (all JSON)

- `GET /health` — simple health check.

### AI
- `POST /api/ai/text` → `{ text }`  
  Body: `{ prompt: string, lang: "zh"|"en" }`
- `POST /api/ai/analyze-image` → `{ result }` (raw JSON string from Gemini)  
  Body: `{ imageBase64, lang, mealTimes, existingMeds }`

### Medications (requires `x-user-id` header)
- `GET /api/medications` → list
- `POST /api/medications` → `{ id }`  
  Body: medication fields
- `PUT /api/medications/:id` → `{ ok: true }`
- `DELETE /api/medications/:id` → `{ ok: true }`
- `GET /api/medications/:id/records` → list of records
- `POST /api/medications/:id/records` → `{ id }`

### Settings (requires `x-user-id` header)
- `GET /api/settings` → `{ ... }`
- `POST /api/settings` → `{ ok: true }`  
  Body: `{ mealTimes?, emailNotification? }`

## Frontend integration tips

- Replace direct calls to client-side Gemini/Firebase with `fetch` to the endpoints above.
- Include `x-user-id` for user-specific data (from your auth flow).
- Keep API keys only in server `.env`; do not expose them in the frontend.

## Build

```bash
yarn build   # outputs to dist/
yarn start   # run compiled server
```
