# Oli-Locator Backend

A home-improvement lead finder backend covering **USA**, **UK**, and **Australia**. Designed for tradespeople to discover, save, and manage leads across 11 home-improvement trades.

## Features

- **Lead Search** — Filter leads by country, trade, and city/postcode with pagination
- **Saved Leads** — Save and manage favorite leads
- **Request-a-Quote Inbox** — Public form submissions with status tracking (new → contacted → quoted → won/lost)
- **Call Log** — Track outbound calls to leads
- **Settings** — Configure default country, preferred trades, and business details
- **Auth** — scrypt password hashing + Ed25519-signed session tokens with brute-force protection

## Architecture

- **Zero npm dependencies** — uses only Node.js built-ins (`http`, `crypto`, `fs`, `path`)
- **JSON-file persistence** — single `data/oli-locator.json` file
- **Pre-seeded demo data** — 50 realistic leads across USA (20), UK (15), and Australia (15)
- **Ed25519 signed tokens** — server-side session revocation
- **IP-based rate limiting** — 5 failed attempts → 15-minute lockout

## Trades Covered

cleaning, plumbing, electrical, roofing, painting, landscaping, carpentry, hvac, flooring, fencing, renovation

## Quick Start

```bash
# 1. Create the owner account (generates a random password)
npm run create-owner -- --username you@business.com

# 2. Start the server (default port 4700)
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4700` | Server port |
| `ALLOWED_ORIGIN` | `*` | CORS allowed origin |
| `OLI_LOCATOR_SESSION_TTL_HOURS` | `12` | Session token TTL |
| `OLI_LOCATOR_MAX_FAILED_ATTEMPTS` | `5` | Max login failures before lockout |
| `OLI_LOCATOR_LOCKOUT_WINDOW_MINUTES` | `15` | Lockout duration |
| `OLI_LOCATOR_DATA_DIR` | `./data` | Data directory path |

## API Endpoints

### Public (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/login` | Login (returns Bearer token) |
| `POST` | `/api/logout` | Logout (revokes session) |
| `POST` | `/api/inbox` | Submit a Request-a-Quote (public form) |

### Protected (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/change-password` | Change owner password |
| `GET` | `/api/leads?country=US&trade=cleaning&city=miami&page=1` | Search/filter leads |
| `GET` | `/api/leads/saved` | Get saved leads |
| `POST` | `/api/leads/:id/save` | Save a lead |
| `DELETE` | `/api/leads/:id/save` | Unsave a lead |
| `GET` | `/api/inbox` | List inbox submissions |
| `PUT` | `/api/inbox/:id` | Update submission status |
| `GET` | `/api/calls` | List call log entries |
| `POST` | `/api/calls` | Create a call log entry |
| `GET` | `/api/settings` | Get user settings |
| `PUT` | `/api/settings` | Update user settings |

### Request/Response Examples

**Login:**
```json
POST /api/login
{ "username": "you@business.com", "password": "your-password" }
→ { "ok": true, "token": "...", "expiresAt": "..." }
```

**Search Leads:**
```
GET /api/leads?country=US&trade=plumbing&city=miami&page=1&pageSize=10
→ { "leads": [...], "total": 3, "page": 1, "pageSize": 10, "totalPages": 1 }
```

**Submit Quote Request (public):**
```json
POST /api/inbox
{ "customerName": "Jane Doe", "customerEmail": "jane@example.com", "trade": "plumbing", "city": "London", "country": "UK", "description": "Need a plumber for leaking pipe" }
→ { "submission": { "id": "...", "status": "new", ... } }
```

**Create Call Log:**
```json
POST /api/calls
{ "leadId": "abc-123", "leadName": "Maria Gonzalez", "phone": "+12005551234", "durationMinutes": 8, "outcome": "interested", "notes": "Will send quote tomorrow" }
→ { "call": { "id": "...", ... } }
```

**Update Settings:**
```json
PUT /api/settings
{ "defaultCountry": "UK", "preferredTrades": ["plumbing", "electrical"], "businessName": "Quick Fix Ltd", "businessPhone": "+447700900000", "businessEmail": "info@quickfix.co.uk" }
→ { "settings": { ... } }
```

## Lead Data Structure

Each lead contains:
- `id` — UUID
- `title` — Job description
- `trade` — One of the 11 trades
- `country` — US, UK, or AU
- `city` — City name
- `postcode` — Local postcode format
- `budget` — `{ min, max }` in local currency cents (USD cents / GBP pence / AUD cents)
- `urgency` — low, medium, or high
- `leadScore` — 0–100 quality score
- `customerName`, `customerPhone`, `customerEmail` — Contact details
- `postedAt` — ISO timestamp
- `description` — Full job description

## Requirements

- Node.js >= 18
