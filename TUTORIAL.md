# AI Avatar IT Support Agent (LiveKit + Beyond Presence)

Replication of the tutorial project, adapted to this machine and to Gemini Live
(the tutorial's OpenAI realtime model needs paid credits; this account has none).

## Layout

```
test141/
├── voice-agent/                 # Python agent (LiveKit)
│   ├── agent.py                 # tutorial entrypoint: screen vision, tools, avatar, typing sound
│   ├── tools.py                 # unblock_user + send_email (with RPC notifications)
│   ├── prompts.py               # AGENT_INSTRUCTIONS
│   ├── generic_corporate_app/   # dummy corporate login app (Vite + React)
│   └── test141.py               # earlier minimal Gemini Live agent (kept for reference)
└── avatar_front_end/            # custom frontend (Next.js, from the video)
    └── components/Rpc_Handler.tsx
```

## 1. Agent

```bash
cd voice-agent
uv run agent.py dev        # local worker (hot reload)
uv run agent.py console    # voice console, no browser needed
```

It registers as `voice-agent-dev` locally (see `AGENT_NAME` in `.env.local`) so it
does not compete with the old Cloud agent still deployed as `voice-agent`.

### Required env (voice-agent/.env.local)

| Variable | Purpose | Status |
|---|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit project | set |
| `GOOGLE_API_KEY` | Gemini Live realtime model | set |
| `BEY_API_KEY`, `BEY_AVATAR_ID` | Beyond Presence avatar | **missing** |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | `send_email` tool | **missing** |

Without the Beyond Presence pair the avatar is skipped and the rest still runs.
Without the Gmail pair the email tool replies that it is not configured.

## 2. Generic Corporate App

```bash
cd voice-agent/generic_corporate_app
pnpm dev                   # http://localhost:5173
```

Login: `\vienna\maxman123` / `passw0rd`.

To simulate a blocked account, put `maxman123` on a line in
`public/blockusers.txt`. The agent's `unblock_user` tool empties that file.

## 3. Custom frontend

```bash
cd avatar_front_end
pnpm dev                   # http://localhost:3000
```

`app/api/connection-details/route.ts` dispatches `AGENT_NAME` (default
`voice-agent`) into the room via `roomConfig`, so the agent joins automatically.
`components/Rpc_Handler.tsx` listens for `client.showNotification` and shows the
green "unblocked" / blue "email sent" popup.

## Test flow (matches the video)

1. Start the agent: `uv run agent.py dev`
2. Start the generic app: `pnpm dev` in `generic_corporate_app`
3. Block the user: write `maxman123` into `public/blockusers.txt`
4. Start the frontend: `pnpm dev` in `avatar_front_end`, open http://localhost:3000
5. Start the call, share the **generic app tab** (screen share button)
6. Ask for help logging in; the agent should spot the blocked message, clear the
   file, and a green notification should appear in the frontend.

## Deploying this agent to LiveKit Cloud (later)

1. Add the missing keys as Cloud secrets:
   ```bash
   lk agent update-secrets --secrets BEY_API_KEY=... BEY_AVATAR_ID=... \
     GMAIL_USER=... GMAIL_APP_PASSWORD=... GOOGLE_API_KEY=...
   ```
2. Point the Dockerfile at the new entrypoint:
   `CMD ["uv", "run", "agent.py", "start"]`
3. Deploy: `lk agent deploy`
4. Remove `AGENT_NAME=voice-agent-dev` from both `.env.local` files so the
   frontend dispatches the deployed `voice-agent`.

## Notes

- `google-genai` is pinned `<3` because 3.x builds a malformed Live API WebSocket
  URL with `livekit-plugins-google` 1.8.x.
- The greeting waits ~2s after session start; asking Gemini to speak before its
  websocket finishes setup makes `generate_reply` time out.
- `send_email` runs SMTP in a worker thread so the voice pipeline is not blocked.
