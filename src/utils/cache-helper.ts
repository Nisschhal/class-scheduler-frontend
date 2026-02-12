import { clearCache } from "../middleware/cache.middleware.js"
import { CACHE_KEYS } from "./"

/**
 * RESOURCE INVALIDATOR
 * Why: Some resources are linked. If an Instructor changes, the Class list is now stale.
 * This utility ensures that the "Ripple Effect" happens automatically and safely.
 */
export const invalidateResourceCache = async (
  resourceName: keyof typeof CACHE_KEYS,
) => {
  switch (resourceName) {
    case "INSTRUCTORS":
      // When an instructor changes, clear Instructors AND Classes
      await clearCache(CACHE_KEYS.INSTRUCTORS)
      await clearCache(CACHE_KEYS.CLASSES)
      break

    case "ROOMS":
      // When a room changes, clear Rooms AND Classes
      await clearCache(CACHE_KEYS.ROOMS)
      await clearCache(CACHE_KEYS.CLASSES)
      break

    case "CLASSES":
      // When a class changes, only the class cache needs to clear
      await clearCache(CACHE_KEYS.CLASSES)
      break

    default:
      await clearCache(CACHE_KEYS.ALL)
      break
  }
}
