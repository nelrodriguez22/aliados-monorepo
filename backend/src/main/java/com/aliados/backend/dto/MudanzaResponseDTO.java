package com.aliados.backend.dto;

import com.aliados.backend.entity.ModoChat;
import com.aliados.backend.entity.MudanzaEstado;
import com.aliados.backend.entity.MudanzaTurno;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class MudanzaResponseDTO {

    private Long id;

    // Cliente
    private Long clienteId;
    private String clienteNombre;

    // Proveedor
    private Long proveedorId;
    private String proveedorNombre;

    // Tier actual
    private Long tierId;
    private String tierNombre;
    private String tierEmoji;

    // Tier original (si hubo contrapropuesta)
    private Long tierOriginalId;
    private String tierOriginalNombre;

    // Estado
    private MudanzaEstado estado;

    // Ubicaciones
    private String direccionOrigen;
    private Double latitudOrigen;
    private Double longitudOrigen;
    private String direccionDestino;
    private Double latitudDestino;
    private Double longitudDestino;

    // Accesibilidad
    private Integer pisos;
    private Boolean tieneAscensor;
    private Integer cantidadAmbientes;

    // Fecha y turno
    private LocalDate fechaDeseada;
    private LocalDate fechaConfirmada;
    private LocalDate fechaOriginal; // si hubo contrapropuesta de fecha
    private MudanzaTurno turno;

    // Media
    private String fotos;
    private String notasCliente;

    // Montos
    private BigDecimal montoBase;
    private BigDecimal montoFinal;
    private BigDecimal montoExtra;
    private BigDecimal comisionPorcentaje;
    private BigDecimal comisionMonto;
    private BigDecimal montoProveedor;

    // Contrapropuesta
    private String motivoContrapropuesta;

    // Cronómetro
    private LocalDateTime iniciadoAt;
    private LocalDateTime finalizadoAt;
    private Integer duracionRealMinutos;
    private Integer bloquesExtra;

    // Timestamps
    private LocalDateTime createdAt;
    private LocalDateTime reservadoAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime completedAt;
    private LocalDateTime cancelledAt;
    private String motivoCancelacion;

    private String codigoProveedor;

    // null = todavía no hay conversación (el cliente no aceptó aún) → la UI no muestra el chat.
    private Long conversacionId;

    // ESCRITURA | LECTURA. El backend es la ÚNICA fuente de verdad de la ventana de escritura:
    // el frontend obedece este valor y NUNCA vuelve a derivar la regla desde el estado. Si la
    // lista de estados viviera también en el frontend, agregar un estado nuevo y olvidarse de un
    // lado dejaría el input habilitado contra un backend que responde 409 al enviar.
    private ModoChat chatModo;
}
