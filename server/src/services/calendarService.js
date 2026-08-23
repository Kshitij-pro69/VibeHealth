import { google } from 'googleapis';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { logger } from '../utils/logger.js';

export class CalendarService {
  /**
   * Instantiates an OAuth2 client with client ID, secret, and redirect URI.
   */
  static _getOAuthClient(tokens = null) {
    if (!config.googleCalendar.clientId || !config.googleCalendar.clientSecret) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      config.googleCalendar.clientId,
      config.googleCalendar.clientSecret,
      config.googleCalendar.redirectUri
    );

    if (tokens) {
      oauth2Client.setCredentials(tokens);
    }

    return oauth2Client;
  }

  /**
   * Generates Google OAuth consent URL for a user to connect their Google Calendar.
   * Mandates access_type='offline' and prompt='consent' so Google issues a refresh token.
   */
  static getAuthUrl(state) {
    const oauth2Client = this._getOAuthClient();
    if (!oauth2Client) return null;

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state: state ? String(state) : undefined,
    });
  }

  /**
   * Exchanges OAuth authorization code for access & refresh tokens.
   */
  static async exchangeCodeForTokens(code) {
    try {
      const oauth2Client = this._getOAuthClient();
      if (!oauth2Client) throw new Error('OAuth2 client credentials not configured');

      const { tokens } = await oauth2Client.getToken(code);
      return { success: true, tokens };
    } catch (err) {
      logger.error('Error exchanging OAuth code for tokens:', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Handles reauth_required state on invalid_grant error (token revoked/expired).
   * Clears stored tokens and sets calendarStatus = 'reauth_required'.
   */
  static async handleReauthRequired(userId) {
    try {
      logger.warn(`Google OAuth invalid_grant detected for user #${userId}. Marking status=reauth_required and clearing tokens.`);
      
      await User.findByIdAndUpdate(userId, {
        calendarStatus: 'reauth_required',
        $unset: { googleTokens: 1 },
      });

      // Also clear DoctorProfile if user is a physician
      await DoctorProfile.findOneAndUpdate(
        { userId },
        { $unset: { googleOAuthTokens: 1 } }
      );

      return true;
    } catch (err) {
      logger.error(`Failed to update reauth_required status for user #${userId}:`, { error: err.message });
      return false;
    }
  }

  /**
   * Obtains an authenticated google.auth.OAuth2 client for a given user.
   * Auto-refreshes tokens and attaches a token rotation listener to save updated tokens back to MongoDB.
   */
  static async getAuthenticatedClient(userId) {
    try {
      const user = await User.findById(userId)
        .select('+googleTokens.access_token +googleTokens.refresh_token +googleTokens.expiry_date +googleTokens.scope +googleTokens.token_type')
        .lean();

      if (!user || user.calendarStatus === 'not_connected') {
        return null;
      }

      let tokens = user.googleTokens;

      // Fallback check on DoctorProfile if User document doesn't have tokens yet
      if ((!tokens || !tokens.access_token) && user.role === 'doctor') {
        const doctorProfile = await DoctorProfile.findOne({ userId })
          .select('+googleOAuthTokens.accessToken +googleOAuthTokens.refreshToken +googleOAuthTokens.expiryDate')
          .lean();
        if (doctorProfile?.googleOAuthTokens?.accessToken) {
          tokens = {
            access_token: doctorProfile.googleOAuthTokens.accessToken,
            refresh_token: doctorProfile.googleOAuthTokens.refreshToken,
            expiry_date: doctorProfile.googleOAuthTokens.expiryDate,
          };
        }
      }

      if (!tokens || (!tokens.access_token && !tokens.accessToken)) {
        return null;
      }

      const formattedTokens = {
        access_token: tokens.access_token || tokens.accessToken,
        refresh_token: tokens.refresh_token || tokens.refreshToken,
        expiry_date: tokens.expiry_date || tokens.expiryDate,
        token_type: tokens.token_type || tokens.tokenType || 'Bearer',
        scope: tokens.scope || 'https://www.googleapis.com/auth/calendar.events',
      };

      const oauth2Client = this._getOAuthClient(formattedTokens);
      if (!oauth2Client) return null;

      // Listen for token auto-refreshes by googleapis and save updated tokens to DB
      oauth2Client.on('tokens', async (newTokens) => {
        logger.info(`Auto-refreshed Google OAuth tokens for user #${userId}`);
        try {
          const update = {
            'googleTokens.access_token': newTokens.access_token,
            'googleTokens.expiry_date': newTokens.expiry_date,
            calendarStatus: 'connected',
          };
          if (newTokens.refresh_token) {
            update['googleTokens.refresh_token'] = newTokens.refresh_token;
          }
          await User.findByIdAndUpdate(userId, update);
        } catch (dbErr) {
          logger.error(`Error persisting rotated tokens for user #${userId}:`, { error: dbErr.message });
        }
      });

      return oauth2Client;
    } catch (err) {
      logger.error(`Error getting authenticated client for user #${userId}:`, { error: err.message });
      return null;
    }
  }

  /**
   * Creates a calendar event on the user's primary Google Calendar.
   * Catches invalid_grant specifically to mark calendarStatus='reauth_required'.
   */
  static async createEvent(userId, { title, description, startTime, endTime, patientEmail, doctorEmail }) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      if (!auth) {
        return { success: false, error: 'User has not connected Google Calendar' };
      }

      const calendar = google.calendar({ version: 'v3', auth });

      const eventPayload = {
        summary: title || 'VibeHealth Consultation',
        description: description || 'Healthcare consultation scheduled via VibeHealth',
        start: {
          dateTime: new Date(startTime).toISOString(),
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
        },
        attendees: [
          ...(patientEmail ? [{ email: patientEmail }] : []),
          ...(doctorEmail ? [{ email: doctorEmail }] : []),
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventPayload,
      });

      logger.info(`Created Google Calendar event #${res.data.id} for user #${userId}`);
      return {
        success: true,
        eventId: res.data.id,
        htmlLink: res.data.htmlLink,
      };
    } catch (err) {
      const isInvalidGrant =
        err.code === 400 ||
        err.message?.includes('invalid_grant') ||
        err.response?.data?.error === 'invalid_grant';

      if (isInvalidGrant) {
        await this.handleReauthRequired(userId);
        return { success: false, reauthRequired: true, error: 'invalid_grant' };
      }

      logger.error('Error in CalendarService.createEvent:', { error: err.message, userId });
      return { success: false, error: err.message };
    }
  }

  /**
   * Updates an existing calendar event (e.g. on reschedule).
   */
  static async updateEvent(userId, eventId, { title, description, startTime, endTime }) {
    if (!eventId) return { success: false, error: 'Missing event ID' };

    try {
      const auth = await this.getAuthenticatedClient(userId);
      if (!auth) return { success: false, error: 'User not connected to Google Calendar' };

      const calendar = google.calendar({ version: 'v3', auth });

      const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: {
          summary: title || 'VibeHealth Consultation',
          description: description || 'Updated consultation schedule',
          start: { dateTime: new Date(startTime).toISOString() },
          end: { dateTime: new Date(endTime).toISOString() },
        },
      });

      logger.info(`Updated Google Calendar event #${eventId} for user #${userId}`);
      return { success: true, eventId: res.data.id };
    } catch (err) {
      const isInvalidGrant =
        err.code === 400 ||
        err.message?.includes('invalid_grant') ||
        err.response?.data?.error === 'invalid_grant';

      if (isInvalidGrant) {
        await this.handleReauthRequired(userId);
        return { success: false, reauthRequired: true, error: 'invalid_grant' };
      }

      logger.error('Error in CalendarService.updateEvent:', { error: err.message, eventId });
      return { success: false, error: err.message };
    }
  }

  /**
   * Cancels/deletes an event on Google Calendar.
   */
  static async deleteEvent(userId, eventId) {
    if (!eventId) return { success: false, error: 'Missing event ID' };

    try {
      const auth = await this.getAuthenticatedClient(userId);
      if (!auth) return { success: false, error: 'User not connected to Google Calendar' };

      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });

      logger.info(`Deleted Google Calendar event #${eventId} for user #${userId}`);
      return { success: true };
    } catch (err) {
      const isInvalidGrant =
        err.code === 400 ||
        err.message?.includes('invalid_grant') ||
        err.response?.data?.error === 'invalid_grant';

      if (isInvalidGrant) {
        await this.handleReauthRequired(userId);
        return { success: false, reauthRequired: true, error: 'invalid_grant' };
      }

      logger.error('Error in CalendarService.deleteEvent:', { error: err.message, eventId });
      return { success: false, error: err.message };
    }
  }
}
