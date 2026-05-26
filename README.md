# Flash Sale System

A production-grade flash sale platform built to handle high-concurrency purchase flows. The system is designed around the core problem of flash sales: a large number of users attempting to buy a limited quantity of items simultaneously, where inventory must never go negative and every request must be handled consistently under load.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Key Engineering Decisions](#key-engineering-decisions)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [How a Purchase Works](#how-a-purchase-works)
- [Background Services](#background-services)
- [Admin Dashboard](#admin-dashboard)

---

## Overview

Flash sales have a traffic pattern unlike regular e-commerce. When a sale starts, traffic goes from zero to peak in under five seconds. The system must handle this spike without overselling inventory, losing orders, or corrupting state.

This project addresses that problem through atomic inventory management in Redis, an outbox pattern for reliable event publishing, a saga pattern for payment failure compensation, and a reconciliation job that detects and fixes any inconsistencies between Redis and Postgres.

The project is split into a backend (Node.js + Express) and a frontend (React + Vite), with all infrastructure defined in a single Docker Compose file at the root.

---

## Architecture
<img src="/images/Screenshot 2026-05-26 at 11.01.38 PM.jpg" width="700"/>

**Infrastructure:**
- PostgreSQL — durable storage for users, products, sales, orders
- Redis — inventory counters, rate limiting, distributed locks, session data
- RabbitMQ — async message queue between order creation and payment processing
- MinIO — S3-compatible object storage for product images
- Socket.io — real-time inventory updates pushed to connected clients

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Runtime | Node.js + Express | Non-blocking I/O suits high-concurrency workloads |
| Database | PostgreSQL | ACID transactions for order and user data |
| Cache | Redis | Sub-millisecond atomic operations for inventory |
| Queue | RabbitMQ | Durable async processing, decouples order creation from payment |
| Object Storage | MinIO | S3-compatible, runs locally in Docker |
| Real-time | Socket.io | WebSocket rooms scoped per sale for inventory broadcasts |
| Frontend | React + Vite | Fast dev builds, component-based UI |
| Styling | Tailwind CSS v4 | Utility-first, no config file required in v4 |

---

## Project Structure

```
flash-sale-system/
├── docker-compose.yml          # All infrastructure (Postgres, Redis, RabbitMQ, MinIO)
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js           # Postgres connection pool
│   │   │   ├── redis.js        # Redis client
│   │   │   ├── rabbitmq.js     # RabbitMQ connection, queue definitions
│   │   │   ├── minio.js        # MinIO client, bucket initialization
│   │   │   └── socket.js       # Socket.io server, Redis adapter
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT authentication, requireAdmin guard
│   │   │   ├── rateLimiter.js  # Sliding window rate limiters
│   │   │   └── errorHandler.js # Global error handler
│   │   ├── models/
│   │   │   └── schema.sql      # Full database schema
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── productRoutes.js
│   │   │   ├── saleRoutes.js
│   │   │   ├── orderRoutes.js
│   │   │   └── adminRoutes.js
│   │   ├── services/
│   │   │   ├── inventoryService.js   # Redis Lua script, reserve/release
│   │   │   ├── orderService.js       # Order creation with outbox
│   │   │   ├── paymentService.js     # RabbitMQ consumer, saga compensation
│   │   │   ├── notificationService.js # RabbitMQ consumer for notifications
│   │   │   ├── saleScheduler.js      # SCHEDULED -> ACTIVE -> ENDED transitions
│   │   │   ├── outboxPoller.js       # Publishes outbox events to RabbitMQ
│   │   │   └── reconciliationJob.js  # Inventory consistency checks
│   │   └── app.js
│   ├── .env
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   ├── client.js       # Axios instance with interceptors
    │   │   ├── auth.js
    │   │   ├── sales.js
    │   │   ├── orders.js
    │   │   ├── products.js
    │   │   ├── admin.js
    │   │   └── socket.js       # Socket.io client
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── ProtectedRoute.jsx
    │   │   ├── AdminRoute.jsx
    │   │   └── admin/
    │   │       └── AdminLayout.jsx
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── hooks/
    │   │   └── useCountdown.js
    │   └── pages/
    │       ├── LoginPage.jsx
    │       ├── RegisterPage.jsx
    │       ├── SalesPage.jsx
    │       ├── SaleDetailPage.jsx
    │       ├── OrdersPage.jsx
    │       └── admin/
    │           ├── AdminDashboard.jsx
    │           ├── AdminProducts.jsx
    │           ├── AdminSales.jsx
    │           ├── AdminOrders.jsx
    │           └── AdminSaleMonitor.jsx
    ├── .env
    └── package.json
```

---

## Key Engineering Decisions

### Atomic inventory decrement via Lua script

The core problem in a flash sale is preventing overselling under concurrent load. A naive approach using `SELECT` then `UPDATE` in Postgres has a race condition — two requests can both read `qty = 1`, both pass the check, and both decrement, resulting in `qty = -1`.

Redis is used as the inventory store during an active sale. A Lua script handles the check-and-decrement atomically. Redis executes Lua scripts in a single operation — nothing else runs between the check and the decrement.

```lua
local qty = redis.call('GET', KEYS[1])
if qty == false then return -2 end
if tonumber(qty) <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
```

Return values: `-2` means the key does not exist (sale not active), `-1` means out of stock, any non-negative value is the remaining count after the decrement.

### Outbox pattern for reliable event publishing

Publishing to RabbitMQ and writing to Postgres as two separate operations creates a failure window. If the server crashes after writing the order but before publishing the event, the order exists but payment never processes.

The outbox pattern solves this by writing the RabbitMQ event as a row in an `outbox` table within the same Postgres transaction as the order. A poller reads unpublished rows every 5 seconds and publishes them to RabbitMQ, then marks them published. The event is guaranteed to eventually be published because it is durable in Postgres. A crash causes a short delay, not a lost event.

### Saga pattern for payment failure compensation

The purchase flow spans multiple systems (Redis, Postgres, RabbitMQ, payment gateway). Two-phase commit across these systems is not practical. Instead, a saga is used — a sequence of local transactions where each failure triggers a compensating transaction to undo previous steps.

If payment fails: the order status is set to FAILED, the `reserved_qty` on `sale_products` is decremented, and the inventory unit is returned to Redis via `INCR`. The user receives a notification. The system is left in a consistent state with no dangling reservations.

### Redis sliding window rate limiter

A fixed-window rate limiter has a boundary problem. A user can send the maximum allowed requests at the end of one window and again at the start of the next, effectively doubling their rate at the boundary.

The sliding window implementation uses a Redis sorted set. Each request is stored as a member with its timestamp as the score. On each request, members older than the window are removed, the remaining count is checked against the limit, and the new request is added. The entire operation runs in a Lua script for atomicity. This ensures the limit is enforced over any rolling time window, not just fixed intervals.

### Distributed lock for background services

When multiple Node.js instances run (horizontal scaling), background services like the sale scheduler, outbox poller, and reconciliation job would run on every instance simultaneously. This causes race conditions — a sale could be activated multiple times, outbox events published multiple times.

A Redis lock (`SET NX EX`) ensures only one instance runs each background service per tick. The instance that acquires the lock runs the job and releases the lock on completion. All other instances skip that tick.

### Reconciliation job

Even with atomic operations, edge cases exist. A server crash between the Redis decrement and the Postgres write leaves an orphaned decrement — Redis shows one fewer unit than the DB says should be available. The reconciliation job runs every 5 minutes and compares Redis inventory counts against DB order counts for every active sale. It restores any orphaned units, fixes over-releases, fails out stuck PENDING orders older than 15 minutes, and syncs Redis counts back to the inventory table in Postgres.

---

## API Reference

### Auth
```
POST   /api/auth/register       Register a new user
POST   /api/auth/login          Login, returns JWT
GET    /api/auth/me             Get current user (protected)
```

### Products
```
GET    /api/products            List all active products (paginated)
GET    /api/products/:id        Get a single product
POST   /api/products            Create product with image upload (protected)
PUT    /api/products/:id        Update product (protected)
DELETE /api/products/:id        Soft delete product (protected)
```

### Sales
```
GET    /api/sales               List sales, filterable by status
GET    /api/sales/:id           Get sale with live inventory if ACTIVE
POST   /api/sales               Create a sale (protected)
POST   /api/sales/:id/products  Add product to sale (protected)
DELETE /api/sales/:id/products/:spId  Remove product from sale (protected)
PATCH  /api/sales/:id/cancel    Cancel a SCHEDULED sale (protected)
PATCH  /api/sales/:id/stop      Force stop an ACTIVE sale (protected)
```

### Orders
```
POST   /api/orders              Place an order (protected, rate limited)
GET    /api/orders              Get current user's order history (protected)
GET    /api/orders/:id          Get a single order (protected)
```

### Admin (all require admin role)
```
GET    /api/admin/stats                    Dashboard overview numbers
GET    /api/admin/orders                   All orders across all users
GET    /api/admin/users                    All users with order counts
GET    /api/admin/sales/:id/monitor        Live sale monitoring with Redis inventory
```

### WebSocket Events
```
Client emits:
  join:sale   <saleId>    Subscribe to real-time updates for a sale
  leave:sale  <saleId>    Unsubscribe

Server emits:
  inventory:update  { saleProductId, availableQty }   On every buy or release
  sale:status       { saleId, status }                 On ACTIVE or ENDED transition
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/flash-sale-system.git
cd flash-sale-system
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts Postgres on port 5433, Redis on 6379, RabbitMQ on 5672 (management UI on 15672), and MinIO on 9000 (console on 9001). The schema is applied automatically on first run via the Docker entrypoint.

### 3. Start the backend

```bash
cd backend
cp .env.example .env   # then fill in values
npm install
npm run dev
```

Backend runs on http://localhost:3000

### 4. Start the frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on http://localhost:5173

### 5. Create an admin user

Register a user through the app or API, then promote them:

```bash
docker exec -it flash_postgres psql -U admin -d flashsale -c \
  "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

Log out and back in to get a token with the admin role. The Admin link will appear in the navbar.

---

## Environment Variables

### Backend `.env`

```
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5433
DB_NAME=flashsale
DB_USER=admin
DB_PASSWORD=secret

REDIS_HOST=localhost
REDIS_PORT=6379

RABBITMQ_URL=amqp://admin:secret@localhost:5672

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=flash-sale-products

JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d
```

### Frontend `.env`

```
VITE_API_URL=http://localhost:3000/api
```

---

## How a Purchase Works

This is the exact sequence of operations when a user clicks Buy:

1. Request hits the global rate limiter (1000 req/sec cap across all users)
2. JWT is validated, `req.user` is populated
3. Per-user general rate limiter checked (10 req/10sec)
4. Per-user buy rate limiter checked (3 attempts/30sec)
5. Idempotency key checked — if this key already has an order, return the existing order immediately
6. Sale active status verified in Redis
7. Sale product existence and sale membership verified in Postgres
8. Duplicate purchase check — user cannot buy the same product twice in the same sale
9. Per-user processing lock acquired in Redis (prevents concurrent duplicate requests)
10. Lua script executes atomically in Redis — checks inventory and decrements in one operation
11. If inventory is 0, processing lock released and 409 returned
12. If inventory decremented successfully, a Postgres transaction begins:
    - Order row inserted with status PENDING
    - Order item row inserted
    - Outbox event row inserted (same transaction)
    - Transaction commits
13. Processing lock released
14. 201 response returned to client
15. Within 5 seconds, outbox poller reads the unpublished event and publishes to RabbitMQ `order.created` queue
16. Payment consumer receives the message, calls payment gateway
17. On success: order status updated to CONFIRMED, outbox event written for notification
18. On failure: order status set to FAILED, `reserved_qty` decremented, inventory unit returned to Redis via INCR, notification event written
19. Notification consumer sends confirmation or failure message to user
20. Socket.io emits `inventory:update` to all clients watching the sale room

If the server crashes at any point between steps 12 and 15, the outbox event is in Postgres and will be published when the server recovers. If it crashes between steps 10 and 12, the reconciliation job detects the orphaned Redis decrement and restores the unit within 5 minutes.

---

## Background Services

Four background services run continuously after startup:

**Sale Scheduler** — runs every 30 seconds. Finds SCHEDULED sales whose start time has passed and activates them (loads inventory into Redis, updates status, emits socket event). Finds ACTIVE sales whose end time has passed and ends them (syncs Redis back to Postgres, cleans up Redis keys, emits socket event). Uses a distributed Redis lock so only one instance runs per tick.

**Outbox Poller** — runs every 5 seconds. Reads up to 50 unpublished rows from the outbox table using `SELECT FOR UPDATE SKIP LOCKED` (safe for multiple instances), publishes each to the appropriate RabbitMQ queue, marks as published. If RabbitMQ is temporarily unavailable, events accumulate in the outbox and are published when it recovers.

**Payment Consumer** — listens continuously on the `order.created` RabbitMQ queue. Processes one message at a time (prefetch = 1). Checks that the order is still PENDING before processing (idempotency guard for redelivered messages). Calls the payment gateway. Handles success and failure paths. Uses `nack` with `requeue = false` on unhandled errors so failed messages go to dead letter rather than retrying infinitely.

**Reconciliation Job** — runs every 5 minutes, first run delayed 2 minutes after startup. Four checks: orphaned inventory decrements (Redis lower than expected), over-releases (Redis higher than expected), stuck PENDING orders older than 15 minutes, and stale unpublished outbox events older than 10 minutes. Fixes what it can automatically, logs warnings for what requires manual attention.

---

## Admin Dashboard

Accessible at `/admin` for users with `role = 'admin'`.

**Dashboard** — total users, confirmed revenue, active sales count, order breakdown by status (confirmed/pending/failed), sales breakdown by status.

**Products** — create products with image upload to MinIO, view all products, deactivate products. Images are stored in MinIO and served via public bucket URL.

**Sales** — create flash sales with start and end times, add products to scheduled sales with sale price and unit quantity, cancel scheduled sales, force stop active sales. Datetime inputs use the browser's native datetime-local picker.

**Sale Monitor** — live view of an active sale. Shows total revenue, units sold, time remaining. Per-product breakdown with inventory progress bar, confirmed/pending/failed order counts, and revenue. Auto-refreshes every 10 seconds. Manual refresh button available.

**Orders** — all orders across all users. Filterable by status. Shows customer name, email, sale name, items, amount, status, and timestamp. Paginated at 20 per page.
