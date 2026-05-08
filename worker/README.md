# YesLetter proxy Worker

Cloudflare Worker that holds the upstream LLM API key server-side, validates
Cloudflare Turnstile, rate-limits per IP, and proxies extraction requests
from the YesLetter frontend.

Default upstream is **gptsapi.net** (Hong Kong reseller, accepts CNY,
OpenAI-compatible). Switch to Google's official Gemini endpoint by
changing `LLM_BASE_URL` in `wrangler.toml`.

## One-time setup

1. **Cloudflare account** — sign up at https://dash.cloudflare.com.
2. **Install Wrangler** locally — `npm i -g wrangler` and `wrangler login`.
3. **Create a Turnstile site** at https://dash.cloudflare.com/?to=/:account/turnstile.
   Copy the **Site Key** (used by the frontend) and **Secret Key** (used here).
4. **Get an LLM API key** from your chosen upstream:
   - gptsapi.net (default): https://gptsapi.net → 充值 → API Keys
   - Google AI Studio: https://aistudio.google.com/api-keys (set monthly budget cap in Google Cloud Console)
5. **Create the KV namespace** for rate limiting:

   ```bash
   cd worker
   wrangler kv:namespace create RATE_LIMIT
   ```

   Paste the returned id into `wrangler.toml` under `[[kv_namespaces]]`.

6. **Set secrets**:

   ```bash
   wrangler secret put LLM_API_KEY
   wrangler secret put TURNSTILE_SECRET_KEY
   ```

7. **Update `wrangler.toml`** if you want to switch upstream:
   - Default `LLM_BASE_URL = "https://api.gptsapi.net"` (gptsapi.net)
   - For official Gemini: `LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"`
   - Update `ALLOWED_ORIGINS` to your frontend domain (e.g. `https://yesletter.org`).

8. **Deploy**:

   ```bash
   pnpm install
   pnpm deploy
   ```

   Wrangler will print the deployed URL, something like
   `https://yesletter-api.your-account.workers.dev`. Configure the
   frontend `VITE_API_BASE` to point at it.

## Local development

```bash
wrangler dev
```

Wrangler runs the Worker locally with the same secrets/bindings as
production (after you've set them with `wrangler secret put`).

## Endpoint

`POST /api/extract`

Request body:
```json
{
  "turnstile_token": "string",
  "model": "gemini-2.5-flash-lite",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

Returns the upstream's chat completion response (OpenAI-compatible shape).
