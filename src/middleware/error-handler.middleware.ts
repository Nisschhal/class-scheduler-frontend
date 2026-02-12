import type { Request, Response, NextFunction } from "express"
import { sendError } from "../utils/api-response.js"

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error(err)

  // Handle Mongoose Validation Errors
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((el: any) => ({
      field: el.path,
      message: el.message,
    }))
    return sendError(res, "Validation Error", "Invalid input data", errors)
  }

  return sendError(
    res,
    "Internal Server Error",
    "Something went wrong on our side",
    [],
    500,
  )
}
