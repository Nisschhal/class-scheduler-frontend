import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import routes from "./routes/index.js"
import { globalErrorHandler } from "./middleware/error-handler.middleware.js"
import swaggerUi from "swagger-ui-express"
import swaggerSpec from "./config/swagger.config.js"
dotenv.config() // Ensure env variables are loaded for the whole app

const app = express()

// ADD THIS DEBUGGER
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`)
  next()
})

// Allow your frontend origin(s) — use * only for testing
app.use(cors({
  origin: '*',  // ← TEMPORARY: allow everyone (test only)
  // Later change to:
  // origin: ['http://localhost:5173', 'https://your-frontend-domain.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // no cookies yet
}));

app.use(express.json())
app.use(express.urlencoded({ extended: true }));

// Base API route
app.get("/", (req, res) => {
  res.send("Welcome to the Class Scheduling System API!")
})
app.use("/api", routes)

// Swagger UI route
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))
console.log(
  `Swagger docs: http://localhost:${process.env.PORT || 3001}/api/docs`,
)
// Final Error Middleware
app.use(globalErrorHandler)

export default app
