package com.aliados.backend.service;

import com.aliados.backend.dto.SignatureResponse;
import com.aliados.backend.entity.TipoUpload;
import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class CloudinaryService {

    private static final Logger logger = LoggerFactory.getLogger(CloudinaryService.class);

    private final Cloudinary cloudinary;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public CloudinaryService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    public SignatureResponse firmar(TipoUpload tipo) {
        long timestamp = System.currentTimeMillis() / 1000L;
        String folder = switch (tipo) {
            case TRABAJO -> "aliados/trabajos";
            case MUDANZA -> "aliados/mudanzas";
            case AVATAR -> "aliados/avatars";
        };
        Map<String, Object> paramsToSign = ObjectUtils.asMap("timestamp", timestamp, "folder", folder);
        String signature = cloudinary.apiSignRequest(paramsToSign, cloudinary.config.apiSecret, cloudinary.config.signatureVersion);
        return new SignatureResponse(
                signature, timestamp, cloudinary.config.apiKey, cloudinary.config.cloudName, folder);
    }

    /** Borra todas las fotos de un `fotos` (JSON array de secure_url). Best-effort. */
    public void borrarFotos(String fotosJson) {
        if (fotosJson == null || fotosJson.isBlank()) return;
        List<String> urls;
        try {
            urls = objectMapper.readValue(fotosJson, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            logger.warn("No se pudo parsear fotos para borrar: {}", e.getMessage());
            return;
        }
        urls.forEach(this::borrarUrl);
    }

    /** Borra una imagen por su secure_url. Best-effort (no propaga errores). */
    public void borrarUrl(String url) {
        String publicId = extraerPublicId(url);
        if (publicId == null) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.emptyMap());
        } catch (Exception e) {
            logger.warn("No se pudo borrar de Cloudinary [{}]: {}", publicId, e.getMessage());
        }
    }

    /** Extrae el public_id (incluida carpeta, sin versión ni extensión) de una secure_url. */
    String extraerPublicId(String secureUrl) {
        if (secureUrl == null) return null;
        int idx = secureUrl.indexOf("/upload/");
        if (idx < 0) return null;
        String afterUpload = secureUrl.substring(idx + "/upload/".length());
        afterUpload = afterUpload.replaceFirst("^v\\d+/", ""); // quita versión v123/
        int dot = afterUpload.lastIndexOf('.');
        if (dot > 0) afterUpload = afterUpload.substring(0, dot); // quita extensión
        return afterUpload.isBlank() ? null : afterUpload;
    }
}
