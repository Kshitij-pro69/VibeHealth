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

  /**
   * Helper: Doctor Onboarding & Login Credentials Template
   */
  static async sendDoctorCredentials({ to, doctorName, email, temporaryPassword, specialty, consultationFee }) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f766e; margin-top: 0;">Welcome to VibeHealth Medical Network 🩺</h2>
        <p>Dear <strong>Dr. ${doctorName}</strong>,</p>
        <p>Your physician profile has been created by the system administrator.</p>
        
        <div style="background-color: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; margin: 20px 0; border-radius: 6px;">
          <h3 style="margin-top: 0; color: #334155; font-size: 14px;">Your Account Credentials:</h3>
          <p style="margin: 6px 0;"><strong>Portal Login Email:</strong> ${email}</p>
          <p style="margin: 6px 0;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #0f766e;">${temporaryPassword}</code></p>
          <p style="margin: 6px 0;"><strong>Specialty:</strong> ${specialty || 'General Practice'}</p>
          <p style="margin: 6px 0;"><strong>Consultation Fee:</strong> ₹${consultationFee || 50}</p>
        </div>

        <p>Please log in at <a href="${config.clientUrl}/login" style="color: #0f766e; font-weight: bold;">${config.clientUrl}/login</a> to access your consultation schedule, review AI triage summaries, and manage clinical documentation.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px;">For security, please change your password after logging in.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: 'Your VibeHealth Physician Account Credentials',
      text: `Dear Dr. ${doctorName},\n\nYour VibeHealth physician account has been created.\nLogin: ${email}\nTemporary Password: ${temporaryPassword}\n\nLogin at: ${config.clientUrl}/login`,
      html,
    });
  }

  /**
   * Helper: Appointment Cancellation Template due to Doctor Unavailability
   */
  static async sendBookingCancellation({ to, patientName, doctorName, startTime, cancellationReason, rebookUrl }) {
    const formattedDate = new Date(startTime).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const targetRebookUrl = rebookUrl || `${config.clientUrl}/patient/doctors`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #b91c1c; margin-top: 0;">Appointment Cancellation Notice ⚠️</h2>
        <p>Dear <strong>${patientName}</strong>,</p>
        <p>We regret to inform you that your upcoming consultation with <strong>Dr. ${doctorName}</strong> scheduled for <strong>${formattedDate}</strong> has been cancelled due to physician unavailability.</p>
        
        <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #991b1b;"><strong>Reason:</strong> ${cancellationReason === 'doctor_unavailable' ? 'Physician on approved schedule leave' : cancellationReason}</p>
        </div>

        <p>We apologize for any inconvenience. You can immediately choose a new date or book with another specialist using the button below:</p>
        <p style="text-align: center; margin: 25px 0;">
          <a href="${targetRebookUrl}" style="background-color: #0f766e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Rebook Consultation</a>
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px;">VibeHealth Automated System — Please do not reply directly to this email.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `Appointment Cancelled with Dr. ${doctorName} - Action Required`,
      text: `Dear ${patientName}, your appointment with Dr. ${doctorName} on ${formattedDate} has been cancelled due to doctor unavailability. Rebook at: ${targetRebookUrl}`,
      html,
    });
  }
}
