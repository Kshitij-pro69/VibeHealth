import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const HOLD_KEY_PREFIX = 'slot:hold:';
const DEFAULT_HOLD_TTL_SECONDS = 300; // 5 minutes

export class SlotHoldService {
  static _buildKey(doctorId, startTimeISO) {
    return `${HOLD_KEY_PREFIX}${doctorId}:${startTimeISO}`;
  }

  /**
   * Attempts to acquire a short-lived hold on an appointment slot in Redis.
   * @param {string} doctorId - Doctor User ID
   * @param {string|Date} startTime - Slot start time
   * @param {string} patientId - Patient User ID
   * @param {number} ttlSeconds - Duration of the hold in seconds
   * @returns {Promise<{ success: boolean, holdToken?: string, expiresAt?: Date, error?: string }>}
   */
  static async acquireHold(doctorId, startTime, patientId, ttlSeconds = DEFAULT_HOLD_TTL_SECONDS) {
    try {
      const redis = getRedisClient();
      const startTimeISO = new Date(startTime).toISOString();
      const key = this._buildKey(doctorId, startTimeISO);
      const holdToken = `hold_${patientId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const payload = JSON.stringify({
        patientId,
        holdToken,
        createdAt: new Date().toISOString(),
      });

      // 'NX' ensures key is set only if it does not already exist
      // 'EX' sets expiration in seconds
      const result = await redis.set(key, payload, 'EX', ttlSeconds, 'NX');

      if (result === 'OK') {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        logger.info(`Acquired Redis slot hold: ${key} for patient ${patientId} (TTL ${ttlSeconds}s)`);
        return {
          success: true,
          holdToken,
          expiresAt,
        };
      }

      // Slot is currently held by another patient
      return {
        success: false,
        error: 'This slot is currently held by another user. Please try again shortly.',
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
   * Verifies if a slot is held by the specified patient or holds a valid token.
   */
  static async verifyHold(doctorId, startTime, patientId) {
    try {
      const redis = getRedisClient();
      const startTimeISO = new Date(startTime).toISOString();
      const key = this._buildKey(doctorId, startTimeISO);
      const data = await redis.get(key);

      if (!data) {
        return { held: false, isOwner: false };
      }

      const parsed = JSON.parse(data);
      const isOwner = parsed.patientId === patientId.toString();

      return {
        held: true,
        isOwner,
        holdToken: parsed.holdToken,
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
      const startTimeISO = new Date(startTime).toISOString();
      const key = this._buildKey(doctorId, startTimeISO);
      await redis.del(key);
      logger.info(`Released Redis slot hold: ${key}`);
      return { success: true };
    } catch (err) {
      logger.error('Error in SlotHoldService.releaseHold:', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}
