import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const HOLD_KEY_PREFIX = 'hold:';
const DEFAULT_HOLD_TTL_SECONDS = parseInt(process.env.SLOT_HOLD_TTL_SECONDS || '600', 10);

export class SlotHoldService {
  static _buildKey(doctorId, startTime) {
    const startTimeISO = new Date(startTime).toISOString();
    return `${HOLD_KEY_PREFIX}${doctorId}:${startTimeISO}`;
  }

  /**
   * Attempts to acquire an atomic lock on an appointment slot in Redis.
   * Command: SET hold:{doctorId}:{startTimeISO} {patientId} NX EX {ttlSeconds}
   *
   * @param {string} doctorId - Doctor User ID
   * @param {string|Date} startTime - Slot start time
   * @param {string} patientId - Patient User ID
   * @param {number} ttlSeconds - Duration of the hold in seconds (default 600s)
   * @returns {Promise<{ success: boolean, holdToken?: string, expiresAt?: Date, error?: string }>}
   */
  static async acquireHold(
    doctorId,
    startTime,
    patientId,
    ttlSeconds = DEFAULT_HOLD_TTL_SECONDS
  ) {
    try {
      const redis = getRedisClient();
      const key = this._buildKey(doctorId, startTime);
      const patientIdStr = patientId.toString();

      // 'NX' ensures key is set ONLY if it does not already exist (Atomic SET-if-Not-Exists)
      // 'EX' sets expiration in seconds
      const result = await redis.set(key, patientIdStr, 'EX', ttlSeconds, 'NX');

      if (result === 'OK') {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        const holdToken = `hold_${patientIdStr}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        logger.info(`Acquired Redis slot lock: ${key} for patient ${patientIdStr} (TTL ${ttlSeconds}s)`);
        return {
          success: true,
          holdToken,
          expiresAt,
        };
      }

      // Lock acquisition failed (already held by another patient)
      return {
        success: false,
        error: 'This slot is being booked by someone else.',
      };
    } catch (err) {
      logger.error('Error in SlotHoldService.acquireHold:', { error: err.message, doctorId, startTime });
      return {
        success: false,
        error: 'Could not acquire slot hold due to cache service error.',
      };
    }
  }

  /**
   * Verifies if a slot hold in Redis exists and belongs to the specified patient.
   */
  static async verifyHold(doctorId, startTime, patientId) {
    try {
      const redis = getRedisClient();
      const key = this._buildKey(doctorId, startTime);
      const storedPatientId = await redis.get(key);

      if (!storedPatientId) {
        return { held: false, isOwner: false };
      }

      const isOwner = storedPatientId === patientId.toString();
      return {
        held: true,
        isOwner,
        storedPatientId,
      };
    } catch (err) {
      logger.error('Error in SlotHoldService.verifyHold:', { error: err.message });
      return { held: false, isOwner: false };
    }
  }

  /**
   * Releases an active slot hold from Redis.
   */
  static async releaseHold(doctorId, startTime) {
    try {
      const redis = getRedisClient();
      const key = this._buildKey(doctorId, startTime);
      await redis.del(key);
      logger.info(`Released Redis slot lock: ${key}`);
      return { success: true };
    } catch (err) {
      logger.error('Error in SlotHoldService.releaseHold:', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}
