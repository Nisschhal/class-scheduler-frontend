import type { Request, Response, NextFunction } from "express"
import { redis } from "../config/redis.js" // IMPORT the shared one

export const cacheMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const key = `cache:${req.originalUrl}`

  try {
    const cachedData = await redis.get(key)
    if (cachedData) {
      const data = JSON.parse(cachedData)
      return res.status(200).json(data)
    }

    const originalJson = res.json
    res.json = function (body: any) {
      if (res.statusCode === 200) {
        // We use setex to store data for 1 hour (3600 seconds)
        redis.setex(key, 3600, JSON.stringify(body))
      }
      return originalJson.call(this, body)
    }

    next()
  } catch (error) {
    next()
  }
}

// Use this in your Controllers
export const clearCache = async (pattern: string = "cache:*") => {
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
    console.log(`🧹 Cache cleared for pattern: ${pattern}`)
  }
}
