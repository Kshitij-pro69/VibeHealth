import { google } from 'googleapis';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class CalendarService {
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
   * Generates Google OAuth consent URL for a doctor to connect their Google Calendar.
   */
  static getAuthUrl(state) {
    const oauth2Client = this._getOAuthClient();
    if (!oauth2Client) return null;

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state,
    });
  }

  /**
   * Exchanges OAuth authorization code for access and refresh tokens.
   */
  static async exchangeCodeForTokens(code) {
    try {
      const oauth2Client = this._getOAuthClient();
      if (!oauth2Client) throw new Error('OAuth2 client not configured');

      const { tokens } = await oauth2Client.getToken(code);
      return { success: true, tokens };
    } catch (err) {
      logger.error('Error exchanging OAuth code:', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Creates a calendar event on the doctor's Google Calendar.
   */
  static async createEvent(tokens, { title, description, startTime, endTime, patientEmail, doctorEmail }) {
    if (!tokens || !tokens.accessToken) {
      return { success: false, error: 'Doctor has not connected Google Calendar' };
    }

    try {
      const auth = this._getOAuthClient(tokens);
      const calendar = google.calendar({ version: 'v3', auth });

      const eventPayload = {
        summary: title || 'VibeHealth Appointment',
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

      logger.info(`Created Google Calendar event: ${res.data.id}`);
      return {
        success: true,
        eventId: res.data.id,
        htmlLink: res.data.htmlLink,
      };
    } catch (err) {
      logger.error('Error in CalendarService.createEvent:', { error: err.message });
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Cancels/deletes an event on Google Calendar.
   */
  static async deleteEvent(tokens, eventId) {
    if (!tokens || !eventId) {
      return { success: false, error: 'Missing tokens or event ID' };
    }

    try {
      const auth = this._getOAuthClient(tokens);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });

      logger.info(`Deleted Google Calendar event: ${eventId}`);
      return { success: true };
    } catch (err) {
      logger.error('Error in CalendarService.deleteEvent:', { error: err.message, eventId });
      return { success: false, error: err.message };
    }
  }
}
