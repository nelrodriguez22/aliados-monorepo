package com.aliados.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);
    private static final String RESEND_ENDPOINT = "https://api.resend.com/emails";

    @Value("${resend.api-key}")
    private String resendApiKey;

    @Value("${resend.from-email}")
    private String fromEmail;

    @Value("${resend.from-name}")
    private String fromName;

    private final RestTemplate restTemplate;

    public EmailService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /**
     * Envía el email de verificación. Devuelve true si Resend lo aceptó (2xx).
     */
    public boolean sendVerificationEmail(String toEmail, String nombre, String verificationLink) {
        String subject = "Verificá tu cuenta en Aliados";
        String htmlContent = buildVerificationEmailHtml(nombre, verificationLink);
        return send(toEmail, subject, htmlContent).statusCode() / 100 == 2;
    }

    /**
     * Envío de prueba para diagnóstico. Bypassea Firebase: pega directo a Resend
     * y expone status + body de la respuesta para validar key y remitente.
     */
    public Map<String, Object> sendTestEmail(String toEmail) {
        String html = "<p>Email de prueba de <strong>Aliados</strong>. Si lo recibís, Resend está entregando OK.</p>";
        SendResult r = send(toEmail, "Test de envío - Aliados", html);

        Map<String, Object> result = new HashMap<>();
        result.put("provider", "Resend");
        result.put("endpoint", RESEND_ENDPOINT);
        result.put("from", fromName + " <" + fromEmail + ">");
        result.put("to", toEmail);
        result.put("apiKeyPresent", resendApiKey != null && !resendApiKey.isBlank());
        result.put("statusCode", r.statusCode());
        result.put("body", r.body());
        result.put("success", r.statusCode() / 100 == 2);
        if (r.error() != null) result.put("error", r.error());
        return result;
    }

    private SendResult send(String toEmail, String subject, String htmlContent) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("from", fromName + " <" + fromEmail + ">");
        payload.put("to", List.of(toEmail));
        payload.put("subject", subject);
        payload.put("html", htmlContent);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(resendApiKey != null ? resendApiKey : "");
        headers.setContentType(MediaType.APPLICATION_JSON);

        try {
            ResponseEntity<String> resp = restTemplate.postForEntity(
                    RESEND_ENDPOINT, new HttpEntity<>(payload, headers), String.class);
            int status = resp.getStatusCode().value();
            logger.debug("✅ Email aceptado por Resend → {} (status {})", toEmail, status);
            return new SendResult(status, resp.getBody(), null);
        } catch (HttpStatusCodeException e) {
            logger.error("❌ Resend rechazó el envío a {}. Status: {}, Body: {}",
                    toEmail, e.getStatusCode().value(), e.getResponseBodyAsString());
            return new SendResult(e.getStatusCode().value(), e.getResponseBodyAsString(), null);
        } catch (Exception e) {
            logger.error("❌ Error de conexión con Resend enviando a {}: {}", toEmail, e.getMessage());
            return new SendResult(0, null, e.getMessage());
        }
    }

    private record SendResult(int statusCode, String body, String error) {}

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
