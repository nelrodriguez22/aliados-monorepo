import { LegalLayout, H2, H3, P, UL } from "./LegalLayout";
import { tw } from "@/shared/styles/design-system";

// Términos y Condiciones Generales de Uso – Aliados (Versión 1.1).
// Texto legal provisto por el cliente. No modificar el contenido sin su OK.
export function Terminos() {
  return (
    <LegalLayout
      title="Términos y Condiciones Generales de Uso"
      subtitle="Versión 1.1 — Con correcciones de cumplimiento legal (Ley 24.240 y Ley 25.326)"
      vigencia="Fecha de vigencia: Junio 2025"
    >
      <P>
        <span className="italic">Nota preliminar:</span> Este documento incorpora correcciones respecto de la versión
        anterior para adecuarlo a la Ley de Defensa del Consumidor (N.° 24.240), la Ley de Protección de Datos
        Personales (N.° 25.326) y la jurisprudencia prevalente en materia de contratos de consumo electrónicos en la
        República Argentina.
      </P>

      <H2>1. Naturaleza del servicio y rol de la plataforma</H2>

      <H3>1.1. Intermediación Digital</H3>
      <P>
        Aliados S.A.S. (en adelante "la Empresa", "la Plataforma" o "Aliados") es una plataforma tecnológica que
        proporciona un espacio virtual de encuentro (Marketplace) destinado a conectar profesionales o técnicos
        independientes (los "Proveedores") con personas físicas o jurídicas que requieren servicios de reparación,
        instalación o mantenimiento (los "Usuarios").
      </P>

      <H3>1.2. Rol de Intermediario y Marco Legal Aplicable</H3>
      <P>
        Aliados actúa como intermediario digital en los términos del artículo 2 de la Ley 24.240 de Defensa del
        Consumidor (LDC) y sus modificatorias. Sin perjuicio de su carácter de plataforma de intermediación, la Empresa
        reconoce la aplicabilidad de las disposiciones de orden público de la LDC en todo lo que corresponda a la
        relación de consumo, en particular los artículos 4 (deber de información), 10 bis (incumplimiento), 37 (cláusulas
        abusivas) y 40 (responsabilidad solidaria en la cadena de comercialización).
      </P>
      <P>
        La Empresa no emplea ni contrata laboralmente a los Proveedores, no ejecuta los servicios técnicos de forma
        directa, y no interviene en la fase material de las tareas solicitadas. El contrato de locación de servicios se
        perfecciona exclusivamente entre el Usuario y el Proveedor. No obstante, Aliados asume las obligaciones que le
        corresponden como proveedor de la plataforma tecnológica conforme a la normativa vigente.
      </P>

      <H2>2. Condiciones aplicables a los usuarios (consumidores)</H2>

      <H3>2.1. Proceso de Contratación y Estructura de Pagos</H3>
      <P>
        El uso de la Plataforma para la solicitud de servicios consta de dos etapas de pago gestionadas a través de
        medios electrónicos:
      </P>
      <P className={tw.text.primary}><span className="font-semibold">A) Cargo por Visita:</span></P>
      <P>
        Al solicitar la concurrencia de un Proveedor, el Usuario abonará un monto inicial fijo que retribuye de manera
        exclusiva el traslado, tiempo, inspección y diagnóstico del Proveedor. El pago de este cargo no garantiza la
        ejecución del servicio ni obliga al Usuario a aceptar el presupuesto posterior.
      </P>
      <UL>
        <li>
          <span className="font-semibold">Inasistencia del Usuario:</span> Si el Usuario no se encuentra en el domicilio
          acordado dentro de la franja horaria pactada, el cargo por visita no será reembolsado.
        </li>
        <li>
          <span className="font-semibold">Inasistencia del Proveedor:</span> Si el Proveedor acordó una visita y no se
          presenta sin justificación dentro del tiempo de espera establecido en la Plataforma, el Usuario tendrá derecho
          al reembolso íntegro del cargo por visita, que será procesado dentro de los 5 (cinco) días hábiles siguientes a
          la reclamación.
        </li>
      </UL>
      <P className={tw.text.primary}><span className="font-semibold">B) Aceptación del Presupuesto (Mano de Obra):</span></P>
      <P>
        Realizado el diagnóstico, el Proveedor emitirá un presupuesto a través de la Plataforma. La aceptación de dicho
        presupuesto por parte del Usuario es vinculante y perfecciona el contrato de locación de servicios. El pago
        corresponde única y exclusivamente a los honorarios por mano de obra.
      </P>

      <H3>2.2. Exclusión de Materiales e Insumos</H3>
      <P>
        El precio cotizado y cobrado a través de la Plataforma corresponde exclusivamente a la visita y/o mano de obra
        del Proveedor. Aliados no comercializa, no provee, no financia ni garantiza materiales, repuestos o insumos
        físicos. La adquisición de dichos elementos es responsabilidad exclusiva del Usuario y del Proveedor, según lo
        acordado entre ellos al margen de la Plataforma. Cualquier estimación de costos de materiales que el Proveedor
        comparta tiene carácter meramente orientativo.
      </P>

      <H3>2.3. Limitación de Responsabilidad conforme a la LDC</H3>
      <P>
        La responsabilidad primaria por la ejecución técnica del servicio recae sobre el Proveedor, quien asume las
        garantías legales establecidas en la normativa vigente. Aliados S.A.S., en su carácter de plataforma
        intermediaria, limita su responsabilidad a las obligaciones que le corresponden como proveedor del servicio
        tecnológico.
      </P>
      <P>
        Conforme al artículo 40 de la Ley 24.240, los integrantes de la cadena de comercialización pueden responder
        solidariamente ante el consumidor por daños causados por el vicio o riesgo del servicio contratado. Esta
        disposición es de orden público y no puede ser derogada por acuerdo contractual. El Usuario conserva todos los
        derechos que le asisten bajo la LDC.
      </P>
      <P>
        Sin perjuicio de lo anterior, Aliados pondrá a disposición del Usuario los mecanismos de mediación interna y
        colaborará activamente con las autoridades de aplicación en caso de reclamos formales.
      </P>

      <H3>2.4. Derecho de Arrepentimiento</H3>
      <P>
        En los casos en que resulte aplicable, el Usuario podrá ejercer el derecho de arrepentimiento en los términos del
        artículo 34 de la LDC, siempre que la solicitud se realice antes de que el Proveedor haya iniciado el
        desplazamiento hacia el domicilio acordado. Una vez iniciado el traslado del Proveedor, el cargo por visita no
        será reembolsable conforme a lo establecido en la cláusula 2.1.A.
      </P>

      <H2>3. Condiciones aplicables a los proveedores (prestadores)</H2>

      <H3>3.1. Independencia y Autonomía</H3>
      <P>
        El Proveedor es un profesional independiente. La utilización de la Plataforma no crea ningún contrato de
        sociedad, mandato, franquicia ni relación laboral o de dependencia con Aliados S.A.S. El Proveedor gestiona su
        propio tiempo, utiliza sus propias herramientas y asume el riesgo económico de su prestación, pudiendo aceptar o
        rechazar solicitudes de cotización libremente.
      </P>

      <H3>3.2. Verificación de Idoneidad y Habilitaciones</H3>
      <P>
        Como condición para operar en la Plataforma, el Proveedor declara bajo juramento que posee la habilitación,
        matrícula o certificación vigente requerida por la normativa local para el ejercicio de las actividades que
        ofrece (v.g., matrícula de gasista certificado, electricista matriculado, plomero habilitado, etc.). Aliados
        realizará controles periódicos de verificación documental. La declaración falsa o la falta de habilitación
        correspondiente será causal suficiente de inhabilitación permanente de la cuenta y podrá dar lugar a las acciones
        legales que correspondan.
      </P>

      <H3>3.3. Obligaciones Fiscales y Regulatorias</H3>
      <P>El Proveedor se obliga a:</P>
      <UL>
        <li>Mantener vigente su inscripción ante AFIP y las rentas provinciales correspondientes.</li>
        <li>
          Emitir la factura legal correspondiente por la totalidad del servicio (Visita + Mano de Obra) directamente a
          nombre del Usuario.
        </li>
        <li>
          Mantener vigente un seguro de Accidentes Personales y/o Responsabilidad Civil, según lo requiera la normativa
          local vigente.
        </li>
      </UL>

      <H3>3.4. Prohibición de Inclusión de Materiales en Presupuesto</H3>
      <P>
        El Proveedor tiene estrictamente prohibido incluir el valor de compra de materiales, insumos o repuestos dentro
        del presupuesto formal cotizado y cobrado a través de la pasarela de pagos de la Plataforma.
      </P>

      <H3>3.5. Calidad del Servicio y Gestión de Cuenta</H3>
      <P>
        Aliados se reserva el derecho de pausar, suspender o inhabilitar la cuenta de Proveedores que acumulen:
        inasistencias reiteradas tras haber cobrado el Cargo por Visita; fraude comprobado; presupuestos engañosos; o
        calificaciones negativas reiteradas. Toda sanción será comunicada al Proveedor con indicación de su causa y el
        Proveedor contará con un canal de apelación interna.
      </P>

      <H2>4. Sistema de pagos, comisiones y facturación</H2>

      <H3>4.1. Pasarela de Pagos — Split Payment</H3>
      <P>
        Todas las transacciones son procesadas a través de Mercado Pago (MercadoLibre S.R.L.). Al aceptar estos TyC,
        Usuarios y Proveedores aceptan asimismo los Términos y Condiciones de uso de Mercado Pago vigentes a la fecha de
        cada transacción.
      </P>

      <H3>4.2. Retención y Liquidación</H3>
      <P>
        Al concretarse un pago, la pasarela retiene automáticamente la comisión correspondiente a Aliados por el uso de
        la licencia de software y transfiere el saldo restante a la cuenta Mercado Pago vinculada del Proveedor. Los
        plazos de acreditación son los establecidos por Mercado Pago conforme a su normativa interna.
      </P>

      <H3>4.3. Facturación por Intermediación</H3>
      <P>
        Aliados S.A.S. emitirá factura al Proveedor únicamente por el monto correspondiente a la comisión por uso de la
        Plataforma.
      </P>

      <H3>4.4. Contracargos y Disputas</H3>
      <P>
        En caso de contracargo iniciado por un Usuario ante su entidad emisora, y de que Mercado Pago debite los fondos
        correspondientes, el Proveedor acepta que Aliados podrá retener dicho monto de saldos futuros, sujeto a los
        mecanismos de resolución de disputas internos de la Plataforma y a los de Mercado Pago.
      </P>

      <H2>5. Protección de datos personales</H2>
      <P>
        El tratamiento de los datos personales de Usuarios y Proveedores se rige por la Política de Privacidad de Aliados
        S.A.S., disponible en la Plataforma, la cual forma parte integrante de estos Términos y Condiciones. Dicha
        Política fue elaborada en cumplimiento de la Ley 25.326 de Protección de Datos Personales y sus normas
        reglamentarias. El uso de la Plataforma implica la aceptación expresa de la Política de Privacidad.
      </P>

      <H2>6. Resolución de disputas y jurisdicción</H2>

      <H3>6.1. Mediación Interna</H3>
      <P>
        En caso de conflictos sobre la calidad del servicio, la Plataforma dispondrá de un canal de mediación voluntaria.
        La participación en dicho proceso no implica asunción de responsabilidad por parte de Aliados S.A.S. ni limita el
        derecho del Usuario a recurrir a las vías administrativas y judiciales que le correspondan.
      </P>

      <H3>6.2. Vías Administrativas del Consumidor</H3>
      <P>
        Sin perjuicio de lo establecido en este contrato, el Usuario conserva en todo momento el derecho de formular
        reclamos ante el Sistema Nacional de Resolución de Conflictos de Consumo (COPREC), la Secretaría de Comercio
        Interior o los organismos provinciales de defensa del consumidor competentes, de conformidad con la LDC.
      </P>

      <H3>6.3. Jurisdicción y Ley Aplicable</H3>
      <P>
        Este acuerdo estará regido por las leyes de la República Argentina. Para disputas entre la Plataforma y los
        Proveedores, las partes acuerdan someter sus diferencias a los Tribunales Ordinarios en lo Civil y Comercial de
        la ciudad de Rosario, Santa Fe. Para disputas con Usuarios consumidores, será aplicable el fuero que corresponda
        conforme al artículo 36 de la Ley 24.240 y la jurisprudencia vigente, pudiendo el consumidor optar por el
        tribunal de su domicilio.
      </P>

      <H2>7. Modificaciones a los términos y condiciones</H2>
      <P>
        Aliados se reserva el derecho de modificar estos TyC en cualquier momento. Las modificaciones serán notificadas
        al Usuario mediante aviso en la Plataforma y/o correo electrónico con una antelación mínima de 10 (diez) días
        corridos antes de su entrada en vigencia. El uso continuado de la Plataforma tras la entrada en vigencia de los
        nuevos TyC implicará su aceptación.
      </P>

      <H2>8. Disposiciones finales</H2>
      <P>
        Si alguna cláusula de estos TyC fuera declarada nula o inaplicable por autoridad competente, dicha nulidad no
        afectará la validez del resto del documento, que continuará vigente en todo lo que no se vea afectado. La no
        exigencia de cumplimiento de alguna cláusula en un momento determinado no implica renuncia al derecho de exigirla
        en el futuro.
      </P>
    </LegalLayout>
  );
}
