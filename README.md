# 🚀 Schedulr Backend

An advanced, high-performance class scheduling engine built with **Node.js**, **Express 5**, and **TypeScript**. This system handles complex recurrence patterns, prevents scheduling conflicts, and utilizes a high-speed caching layer with Redis.

---

## 🛠 Tech Stack

- **Runtime:** Node.js v20 (Alpine-based Docker images)
- **Language:** TypeScript (Type-safe scheduling logic)
- **Framework:** Express.js 5 (Latest version for native Promise support)
- **Database:** MongoDB + Mongoose (Advanced Aggregations)
- **Caching:** Redis (ioredis) for high-speed read operations
- **Validation:** Zod (Schema-based request validation)
- **API Docs:** Swagger (OpenAPI 3.0)
- **DateTime:** date-fns (ISO 8601 compliant logic)

---

## ✨ Key Features

### 1. Advanced Recurrence Engine

Supports multiple scheduling strategies:

- **One-Time:** Single instance classes.
- **Daily:** Repeats every X days.
- **Weekly:** Repeats on specific weekdays with interval support.
- **Monthly:** Repeats on specific days of the month (handles "last day" logic).
- **Custom:** Manual date selection or irregular pattern matching.
- **Multi-Slot:** Support for multiple time slots per day in a single series.

### 2. Explicit Conflict Detection

Before any class is saved, the system executes an **Overlap Check**. It verifies if:

1.  The **Instructor** is already teaching at that time.
2.  The **Room** is already occupied by another class.
    _It returns detailed error messages explaining exactly WHO and WHERE the conflict is._

### 3. Smart Caching (Redis)

Implemented a **Cache-Aside** strategy:

- **Read:** GET requests check Redis before querying MongoDB.
- **Write:** Any POST/PUT/PATCH/DELETE operation automatically invalidates the cache to ensure data integrity.

### 4. Instance Detaching (Exception Handling)

Users can modify a single instance of a recurring series. The system "detaches" that session into a standalone class while maintaining the integrity of the original series using an `exceptions` tracking array.

---

## 🏗 Implementation Details

### Scheduling Logic

The logic resides in `generateAllClassSessions.ts`. It pre-calculates every session date into a `preGeneratedClassSessions` array. This makes the calendar extremely fast because it doesn't have to calculate dates at runtime; it simply fetches them.

### API Response Structure

The API follows a strict standardized format for frontend compatibility:

**Success (Paginated):**

```json
{
  "title": "Classes Fetched",
  "message": "Class list loaded successfully",
  "data": [...],
  "pagination": { "total": 100, "page": 1, "limit": 10, "totalPages": 10 }
}
```

**Error (Validation):**

```json
{
  "title": "Validation Error",
  "message": "Instructor is already booked",
  "errors": [
    { "field": "assignedInstructor", "message": "Conflict on Mon, Feb 14" }
  ]
}
```

---

## 🚀 Getting Started

### 🐳 Running with Docker (Recommended)

The project is containerized to handle MongoDB and Redis automatically.

1.  **Clone the project**
2.  **Run the orchestrator:**
    ```bash
    docker-compose up --build
    ```
    _This will start the Node app, MongoDB, and Redis. The app is set to Asia/Kathmandu timezone for accurate scheduling._

### 💻 Local Development

1.  **Install dependencies:** `npm install`
2.  **Set Environment Variables:** Create a `.env` file.
    ```env
    PORT=3001
    DATABASE_URL=mongodb://localhost:27017/schedulr
    REDIS_URL=redis://localhost:6379
    ```
3.  **Run in Dev Mode:** `npm run dev` (uses `tsx` for hot-reloading TypeScript).

---

## 📖 API Documentation

Once the server is running, access the interactive Swagger documentation at:
👉 `http://localhost:3001/api/docs`

---

## 📂 Project Structure

- `src/controllers`: Request handling and Redis invalidation logic.
- `src/models`: Mongoose schemas for Classes, Instructors, and Rooms.
- `src/utils`: The core `schedule-generator.util.ts` and API response helpers.
- `src/middleware`: Zod validation and Redis caching middleware.
- `src/config`: Database and Redis connection setups with dynamic switching logic.
