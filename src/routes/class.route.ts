import { Router } from "express"
import {
  createClassSeries,
  getPaginatedClasses,
  updateEntireClassSeries,
  deleteEntireClassSeries,
  cancelSingleInstance,
  updateSingleInstance,
} from "../controllers/class.controller.js"
import { cacheMiddleware, validate } from "../middleware/index.js"
import {
  classScheduleSchema,
  detachInstanceSchema,
  paginationQuerySchema,
} from "../utils/index.js"

const router = Router()

router.get(
  "/",
  validate(paginationQuerySchema),
  cacheMiddleware,
  getPaginatedClasses,
)

router.post("/", validate(classScheduleSchema), createClassSeries)

router.put("/:id", validate(classScheduleSchema), updateEntireClassSeries)

router.patch(
  "/:seriesId/instances/:sessionId",
  validate(detachInstanceSchema),
  updateSingleInstance,
)
router.delete("/:seriesId/instances/:sessionId", cancelSingleInstance)
router.delete("/:id", deleteEntireClassSeries)

export default router
