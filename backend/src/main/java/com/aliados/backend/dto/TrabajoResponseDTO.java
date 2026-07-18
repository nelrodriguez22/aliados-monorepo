package com.aliados.backend.dto;

import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.ModoChat;
import com.aliados.backend.entity.TrabajoEstado;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class TrabajoResponseDTO {
    private Long id;
    private Long clienteId;
    private String clienteNombre;
    private Long proveedorId;
    private String proveedorNombre;
    private OficioResponseDTO oficio;
    private TrabajoEstado estado;
    private String descripcion;
    private String direccion;
    private Double latitudCliente;
    private Double longitudCliente;
    private String direccionDestino;
    private Double latitudDestino;
    private Double longitudDestino;
    private Integer tiempoEstimadoMinutos;
    private BigDecimal precioEstimado;
    private String fotos;
    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime completedAt;
    private Boolean calificado;
    private Double proveedorPromedioCalificacion;
    private Integer calificacionEstrellas;
    private BigDecimal tarifaVisita;
    private BigDecimal montoPresupuesto;
    private String notaResumen;
    private Boolean presupuestoAceptado;
    private BigDecimal montoPagado;
    private EstadoPago estadoPago;
    private LocalDateTime pagadoAt;
    private String codigoProveedor;

    // null = todavía no hay conversación (el cliente no aceptó aún) → la UI no muestra el chat.
    private Long conversacionId;

    // ESCRITURA | LECTURA. El backend es la ÚNICA fuente de verdad de la ventana de escritura:
    // el frontend obedece este valor y NUNCA vuelve a derivar la regla desde el estado. Si la
    // lista de estados viviera también en el frontend, agregar un estado nuevo y olvidarse de un
    // lado dejaría el input habilitado contra un backend que responde 409 al enviar.
    private ModoChat chatModo;

    // true si el cliente de este trabajo tiene al proveedor que lo mira como favorito.
    // Solo se completa en la lista de pendientes del proveedor (para destacar la card).
    private boolean favoritoDelCliente;
}