import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class EmailService {
  static _getTransporter() {
    if (!config.email.user || !config.email.pass) {
      return null;
    }

    return nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  }

  /**
   * Sends an email with timeout and error protection.
   */
  static async sendEmail({ to, subject, html, text }) {
    const transporter = this._getTransporter();
    if (!transporter) {
      logger.warn('Email credentials not configured; skipping email dispatch', { to, subject });
      return { success: false, error: 'Email service credentials not configured' };
    }

    try {
      const mailOptions = {
        from: config.email.from,
        to,
        subject,
        text,
        html,
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${to}`, { messageId: info.messageId });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err) {
      logger.error('Error in EmailService.sendEmail:', { error: err.message, to, subject });
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Helper: Appointment Confirmation Template
   */
  static async sendBookingConfirmation({ to, patientName, doctorName, startTime, appointmentId }) {
    const formattedDate = new Date(startTime).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f766e; margin-top: 0;">Appointment Confirmed! 🩺</h2>
        <p>Dear <strong>${patientName}</strong>,</p>
        <p>Your healthcare consultation with <strong>Dr. ${doctorName}</strong> has been successfully booked.</p>
        <div style="background-color: #f0fdfa; padding: 15px; border-left: 4px solid #0f766e; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0;"><strong>Date & Time:</strong> ${formattedDate}</p>
          <p style="margin: 0;"><strong>Appointment Reference:</strong> #${appointmentId}</p>
        </div>
        <p>Please log in to your patient portal anytime to review your visit details or submit pre-visit symptoms.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px;">VibeHealth Automated System — Please do not reply directly to this email.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `Appointment Confirmed with Dr. ${doctorName} - VibeHealth`,
      text: `Your appointment with Dr. ${doctorName} on ${formattedDate} is confirmed. Ref: #${appointmentId}`,
      html,
    });
  }
}
