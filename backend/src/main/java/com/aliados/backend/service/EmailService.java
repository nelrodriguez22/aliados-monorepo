package com.aliados.backend.service;

import com.sendgrid.*;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    @Value("${sendgrid.api-key}")
    private String sendGridApiKey;

    @Value("${sendgrid.from-email}")
    private String fromEmail;

    @Value("${sendgrid.from-name}")
    private String fromName;

    public void sendVerificationEmail(String toEmail, String nombre, String verificationLink) {
        Email from = new Email(fromEmail, fromName);
        Email to = new Email(toEmail);
        String subject = "Verificá tu cuenta en Aliados";
        String htmlContent = buildVerificationEmailHtml(nombre, verificationLink);

        Content content = new Content("text/html", htmlContent);
        Mail mail = new Mail(from, subject, to, content);

        SendGrid sg = new SendGrid(sendGridApiKey);
        Request request = new Request();

        try {
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.build());

            Response response = sg.api(request);

            if (response.getStatusCode() >= 200 && response.getStatusCode() < 300) {
                logger.info("✅ Email de verificación enviado a {}", toEmail);
            } else {
                logger.error("❌ Error enviando email. Status: {}, Body: {}",
                        response.getStatusCode(), response.getBody());
            }
        } catch (IOException e) {
            logger.error("❌ Error de conexión con SendGrid: {}", e.getMessage());
        }
    }

    private String buildVerificationEmailHtml(String nombre, String verificationLink) {
        return """
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                                <!-- Header -->
                                <tr>
                                    <td style="background-color: #054060; padding: 32px 40px; text-align: center;">
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Aliados</h1>
                                        <p style="margin: 8px 0 0; color: #8bb8d4; font-size: 14px;">Tu plataforma de servicios de confianza</p>
                                    </td>
                                </tr>

                                <!-- Body -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                                            ¡Hola, %s! 👋
                                        </h2>
                                        <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                                            Gracias por registrarte en <strong>Aliados</strong>. Para completar tu registro y empezar a usar la plataforma, necesitamos que verifiques tu dirección de correo electrónico.
                                        </p>

                                        <!-- CTA Button -->
                                        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center" style="padding: 8px 0 32px;">
                                                    <a href="%s"
                                                       style="display: inline-block; background-color: #054060; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                                                        Verificar mi cuenta
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin: 0 0 16px; color: #718096; font-size: 14px; line-height: 1.5;">
                                            Si el botón no funciona, copiá y pegá este enlace en tu navegador:
                                        </p>
                                        <p style="margin: 0 0 24px; padding: 12px 16px; background-color: #f7fafc; border-radius: 6px; border: 1px solid #e2e8f0; word-break: break-all; color: #054060; font-size: 13px;">
                                            %s
                                        </p>

                                        <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                                            Este enlace expira en 24 horas. Si no creaste una cuenta en Aliados, podés ignorar este email.
                                        </p>
                                    </td>
                                </tr>

                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f7fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                                        <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                                            © 2026 Aliados · Rosario, Santa Fe, Argentina
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """.formatted(nombre, verificationLink, verificationLink);
    }
}
