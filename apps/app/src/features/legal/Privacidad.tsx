import { LegalLayout, H2, H3, P, UL } from "./LegalLayout";

// Política de Privacidad y Protección de Datos Personales – Aliados.
// Texto legal provisto por el cliente. Email de contacto: aliados@convivirtech.com.ar.
const EMAIL = "aliados@convivirtech.com.ar";

export function Privacidad() {
  return (
    <LegalLayout
      title="Política de Privacidad y Protección de Datos Personales"
      subtitle="Elaborada conforme a la Ley N.° 25.326 y sus normas reglamentarias"
      vigencia="Fecha de vigencia: Junio 2025"
    >
      <P>
        Este documento describe cómo Aliados S.A.S. recopila, utiliza, almacena y protege los datos personales de sus
        Usuarios y Proveedores, en cumplimiento de la Ley 25.326 de Protección de Datos Personales (LPDP) y las
        directivas de la Agencia de Acceso a la Información Pública (AAIP).
      </P>

      <H2>1. Responsable del tratamiento de datos</H2>
      <P>El responsable del tratamiento de los datos personales recopilados a través de la Plataforma es:</P>
      <UL>
        <li><span className="font-semibold">Razón Social:</span> Aliados S.A.S.</li>
        <li><span className="font-semibold">Domicilio Legal:</span> Rosario, Provincia de Santa Fe, República Argentina</li>
        <li>
          <span className="font-semibold">Contacto de Privacidad:</span>{" "}
          <a href={`mailto:${EMAIL}`} className="text-brand-600 dark:text-dark-brand hover:underline">{EMAIL}</a>
        </li>
      </UL>
      <P>
        La base de datos de usuarios y proveedores se encuentra registrada ante la Agencia de Acceso a la Información
        Pública (AAIP) conforme a lo establecido por el artículo 21 de la Ley 25.326.
      </P>

      <H2>2. Datos personales que recopilamos</H2>

      <H3>2.1. Datos proporcionados directamente por el Usuario o Proveedor</H3>
      <UL>
        <li>Nombre y apellido completo</li>
        <li>Dirección de correo electrónico</li>
        <li>Número de teléfono celular</li>
        <li>Domicilio de prestación del servicio (Usuarios) o domicilio de actividad (Proveedores)</li>
        <li>CUIT/CUIL (Proveedores)</li>
        <li>Fotografía de perfil (opcional)</li>
        <li>Documentación de habilitación profesional (Proveedores)</li>
      </UL>

      <H3>2.2. Datos generados por el uso de la Plataforma</H3>
      <UL>
        <li>Historial de solicitudes, presupuestos y servicios contratados</li>
        <li>Calificaciones y comentarios</li>
        <li>Datos de transacciones procesadas (gestionados por Mercado Pago como procesador independiente)</li>
        <li>Registros de acceso, dirección IP, tipo de dispositivo y sistema operativo</li>
        <li>Datos de geolocalización aproximada para asignación de servicios (solo con consentimiento previo del Usuario)</li>
      </UL>

      <H3>2.3. Datos que NO recopilamos</H3>
      <P>
        Aliados NO almacena datos de tarjetas de crédito, débito ni cuentas bancarias. Dicha información es procesada
        exclusivamente por Mercado Pago conforme a su propia política de privacidad y estándares PCI DSS.
      </P>

      <H2>3. Finalidades del tratamiento</H2>
      <P>Los datos personales recopilados son utilizados exclusivamente para las siguientes finalidades:</P>
      <UL>
        <li>Brindar y mejorar los servicios de intermediación de la Plataforma</li>
        <li>Verificar la identidad y habilitaciones de los Proveedores</li>
        <li>Procesar y gestionar pagos y liquidaciones</li>
        <li>Enviar comunicaciones relacionadas con el servicio contratado (confirmaciones, calificaciones, soporte)</li>
        <li>Enviar comunicaciones comerciales y de marketing, únicamente con consentimiento previo y expreso del titular</li>
        <li>Cumplir con obligaciones legales, fiscales y regulatorias</li>
        <li>Resolver disputas y prevenir fraudes</li>
        <li>Elaborar estadísticas e informes internos de uso agregados y anonimizados</li>
      </UL>

      <H2>4. Base legal del tratamiento</H2>
      <P>
        El tratamiento de datos personales por parte de Aliados se sustenta en las siguientes bases legales establecidas
        por la Ley 25.326:
      </P>
      <UL>
        <li>
          <span className="font-semibold">Ejecución del contrato:</span> El tratamiento es necesario para la prestación
          del servicio de intermediación solicitado por el titular.
        </li>
        <li>
          <span className="font-semibold">Obligación legal:</span> Determinados datos son procesados para cumplir con
          obligaciones fiscales y regulatorias.
        </li>
        <li>
          <span className="font-semibold">Consentimiento:</span> Para finalidades adicionales (marketing, geolocalización),
          el tratamiento se basa en el consentimiento libre, previo, expreso e informado del titular, el cual puede ser
          revocado en cualquier momento.
        </li>
      </UL>

      <H2>5. Compartición de datos con terceros</H2>
      <P>
        Aliados S.A.S. no vende, cede ni transfiere datos personales a terceros con fines comerciales propios. Los datos
        podrán ser compartidos exclusivamente en los siguientes supuestos:
      </P>
      <UL>
        <li>Con el Proveedor o el Usuario, en la medida estrictamente necesaria para la prestación del servicio acordado entre ellos.</li>
        <li>Con Mercado Pago (MercadoLibre S.R.L.), como procesador de pagos, en los términos de su contrato de procesamiento de datos.</li>
        <li>Con proveedores de servicios tecnológicos que actúan como encargados del tratamiento bajo instrucciones de Aliados y con obligaciones de confidencialidad equivalentes.</li>
        <li>Con autoridades judiciales, administrativas o de seguridad, cuando así lo exija la normativa vigente o una orden judicial.</li>
      </UL>

      <H2>6. Transferencia internacional de datos</H2>
      <P>
        En caso de que algún proveedor tecnológico contratado por Aliados implicara una transferencia de datos personales
        fuera del territorio argentino, dicha transferencia se realizará únicamente hacia países u organizaciones que
        brinden un nivel adecuado de protección conforme a los estándares de la AAIP, o mediante la suscripción de
        cláusulas contractuales tipo aprobadas por dicho organismo.
      </P>

      <H2>7. Derechos del titular de los datos</H2>
      <P>Conforme al artículo 14 de la Ley 25.326, el titular de los datos personales tiene derecho a:</P>
      <UL>
        <li><span className="font-semibold">Acceso:</span> Conocer los datos personales que Aliados posee sobre usted y las finalidades de su tratamiento.</li>
        <li><span className="font-semibold">Rectificación:</span> Solicitar la corrección de datos inexactos, incompletos o desactualizados.</li>
        <li><span className="font-semibold">Supresión:</span> Solicitar la eliminación de sus datos cuando estos ya no sean necesarios para las finalidades para las que fueron recabados, o cuando revoque su consentimiento.</li>
        <li><span className="font-semibold">Confidencialidad:</span> Solicitar que sus datos no sean divulgados a terceros no autorizados.</li>
      </UL>
      <P>
        Para ejercer cualquiera de estos derechos, el titular deberá enviar una solicitud escrita a:{" "}
        <a href={`mailto:${EMAIL}`} className="text-brand-600 dark:text-dark-brand hover:underline">{EMAIL}</a>,
        identificándose con nombre completo y DNI. Aliados responderá en un plazo no mayor a 5 (cinco) días hábiles para
        el acceso, y 10 (diez) días hábiles para rectificación o supresión, conforme al artículo 14 de la LPDP.
      </P>
      <P>
        La AAIP, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y
        reclamos que se interpongan con relación al incumplimiento de las normas de protección de datos personales. Sitio
        web:{" "}
        <a href="https://www.argentina.gob.ar/aaip" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-dark-brand hover:underline">
          www.argentina.gob.ar/aaip
        </a>
      </P>

      <H2>8. Seguridad de los datos</H2>
      <P>
        Aliados implementa medidas técnicas y organizativas para proteger los datos personales contra accesos no
        autorizados, pérdida, alteración o divulgación indebida, incluyendo:
      </P>
      <UL>
        <li>Cifrado de datos en tránsito (protocolo HTTPS/TLS)</li>
        <li>Control de acceso basado en roles para el personal interno</li>
        <li>Almacenamiento en infraestructura con estándares de seguridad equivalentes a ISO 27001</li>
        <li>Políticas internas de gestión de incidentes de seguridad</li>
      </UL>
      <P>
        En caso de una brecha de seguridad que pueda afectar los derechos de los titulares, Aliados notificará a la AAIP
        y a los afectados en el menor tiempo posible, conforme a las directrices del organismo.
      </P>

      <H2>9. Cookies y tecnologías de seguimiento</H2>
      <P>
        La Plataforma utiliza cookies y tecnologías similares para mejorar la experiencia del usuario, analizar el uso de
        la aplicación y gestionar sesiones. Las cookies utilizadas son:
      </P>
      <UL>
        <li><span className="font-semibold">Cookies esenciales:</span> necesarias para el funcionamiento de la Plataforma. No pueden desactivarse.</li>
        <li><span className="font-semibold">Cookies analíticas:</span> permiten medir el uso de la Plataforma de forma anónima. El Usuario puede desactivarlas en la configuración de la aplicación.</li>
        <li><span className="font-semibold">Cookies de personalización:</span> recuerdan preferencias del Usuario. Su uso requiere consentimiento.</li>
      </UL>

      <H2>10. Conservación de los datos</H2>
      <P>
        Los datos personales serán conservados durante el tiempo necesario para cumplir las finalidades para las que
        fueron recabados y, en todo caso, durante el período en que subsistan obligaciones legales o contractuales que lo
        justifiquen. Una vez finalizada la relación con el Usuario o Proveedor, los datos serán eliminados o anonimizados,
        salvo que la normativa vigente exija su conservación por un plazo mayor.
      </P>

      <H2>11. Menores de edad</H2>
      <P>
        La Plataforma no está dirigida a menores de 18 años. Aliados no recopila intencionalmente datos personales de
        menores de edad. Si se detecta que se han recopilado datos de un menor sin consentimiento verificable del titular
        de la responsabilidad parental, dichos datos serán eliminados de forma inmediata.
      </P>

      <H2>12. Modificaciones a esta política</H2>
      <P>
        Aliados se reserva el derecho de actualizar esta Política de Privacidad en cualquier momento. Las modificaciones
        sustanciales serán notificadas mediante aviso en la Plataforma y/o correo electrónico con una antelación mínima de
        10 (diez) días corridos. El uso continuado de la Plataforma tras la entrada en vigencia de los cambios implicará
        la aceptación de la nueva Política.
      </P>

      <H2>13. Contacto</H2>
      <P>
        Para consultas, solicitudes o reclamos relacionados con el tratamiento de sus datos personales, puede contactarse
        con nosotros a través de:
      </P>
      <UL>
        <li>
          <span className="font-semibold">Correo electrónico:</span>{" "}
          <a href={`mailto:${EMAIL}`} className="text-brand-600 dark:text-dark-brand hover:underline">{EMAIL}</a>
        </li>
        <li><span className="font-semibold">Domicilio legal:</span> Rosario, Provincia de Santa Fe, República Argentina</li>
      </UL>
    </LegalLayout>
  );
}
