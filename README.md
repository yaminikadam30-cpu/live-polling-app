# Pulse — live polls and quizzes

Pulse is a lightweight, realtime polling web app for team meetings. A host creates a six-digit session, shares the join link, opens questions, and reveals live results and a leaderboard. The app deliberately contains **no application-level participant cap**.

## Run locally

1. Install Node.js 20 or later.
2. In this folder, run `npm install`.
3. Run `npm run dev` (or `npm start`).
4. Open `http://localhost:3000`. Create a session in one browser and use the supplied join URL in other browser windows/devices.

## Included experience

- Host question builder with unlimited questions and two to eight answers per question.
- Simple six-digit code and shareable join link.
- Socket.IO-based instant question open/close, answer progress, results, and leaderboard updates.
- Joinable lobby, responsive mobile participant view, and hosts can admit attendees while the session is running.
- Poll-style scoring: every submitted answer earns 100 points. Mark a question as a scored quiz and choose its correct option to award 100 points only for right answers.

## Current local architecture

```text
Browser (host + participants)
       │ Socket.IO / HTTP
Express + Socket.IO server
       │
In-memory session repository (Map)
```

The in-memory repository keeps the demo small and makes it immediately runnable, but sessions disappear on server restart and it is suitable for one server process only.

## Production architecture for 200+ attendees

Use a managed load balancer in front of multiple stateless Node instances. Store durable records in PostgreSQL and use Redis for Socket.IO's adapter, presence, throttling, and ephemeral answer counters. Persist answers asynchronously/batched at question close. Authenticate hosts, issue scoped participant tokens, apply IP/device rate limiting, and collect connection/error metrics.

Suggested core tables:

| Table | Key fields |
| --- | --- |
| `sessions` | `id`, `join_code` (unique), `title`, `status`, `current_question_index`, `created_by`, `created_at` |
| `questions` | `id`, `session_id`, `position`, `text`, `type`, `correct_option_id`, `state` |
| `options` | `id`, `question_id`, `position`, `text` |
| `participants` | `id`, `session_id`, `display_name`, `score`, `joined_at` |
| `answers` | `id`, `question_id`, `participant_id`, `option_id`, `submitted_at` (unique on question/participant) |

## “Unlimited” attendance

The app does not reject participants based on a configured maximum. Literally unlimited simultaneous attendance is not a guarantee any software can make: it is bounded by hosting CPU/memory, WebSocket connection limits, Redis/Postgres throughput, network bandwidth, DDoS controls, and any limits/pricing of the chosen cloud provider. Capacity-test the deployed configuration at or above your expected audience (for example, 200–500 concurrent users), then scale instances and managed services based on measured WebSocket and write load.
