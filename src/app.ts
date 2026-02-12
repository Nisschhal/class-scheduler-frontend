import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import routes from "./routes/index.js"
import { globalErrorHandler } from "./middleware/error-handler.middleware.js"

dotenv.config() // Ensure env variables are loaded for the whole app

const app = express()

// ADD THIS DEBUGGER
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`)
  next()
})

app.use(cors())
app.use(express.json())

// Base API route
app.get("/", (req, res) => {
  res.send("Welcome to the Class Scheduling System API!")
})
app.use("/api", routes)

// Final Error Middleware
app.use(globalErrorHandler)

export default app
