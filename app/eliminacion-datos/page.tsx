export const metadata = { title: 'Eliminación de Datos — Relevvo Studio' }

export default function EliminacionDatos() {
  return (
    <main style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#f9f9f9', minHeight: '100vh', margin: 0 }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 40 }}>Relevvo Studio</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Eliminación de Datos de Usuario</h1>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 40 }}>Última actualización: mayo 2026</p>

        <p style={{ fontSize: 15, lineHeight: 1.7, color: '#444' }}>
          En Relevvo Studio respetamos tu derecho a controlar tu información personal. Si deseas que eliminemos los datos asociados a tu cuenta o número de teléfono, sigue los pasos a continuación.
        </p>

        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '32px 0 10px' }}>¿Qué datos podemos eliminar?</h2>
        <ul style={{ paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: '#444' }}>
          <li>Número de teléfono y nombre registrado.</li>
          <li>Historial de conversaciones con el asistente de WhatsApp.</li>
          <li>Solicitudes de servicio asociadas a tu cuenta.</li>
          <li>Archivos adjuntos enviados a través de WhatsApp o el portal.</li>
        </ul>

        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '32px 0 10px' }}>Cómo solicitar la eliminación</h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: '#444' }}>
          Envía un correo a{' '}
          <a href="mailto:hola@relevvostudio.com" style={{ color: '#E91E8C' }}>hola@relevvostudio.com</a>{' '}
          con el asunto <strong>&quot;Solicitud de eliminación de datos&quot;</strong> e incluye tu nombre y número de teléfono registrado.
        </p>

        <a
          href="mailto:hola@relevvostudio.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
          style={{ display: 'inline-block', marginTop: 24, background: '#E91E8C', color: '#fff', padding: '12px 28px', borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
        >
          Enviar solicitud de eliminación
        </a>

        <h2 style={{ fontSize: 17, fontWeight: 600, margin: '40px 0 10px' }}>Tiempo de respuesta</h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: '#444' }}>
          Procesamos las solicitudes en un plazo máximo de <strong>30 días hábiles</strong>.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '40px 0' }} />
        <p style={{ fontSize: 13, color: '#aaa' }}>© 2026 Relevvo Studio</p>
      </div>
    </main>
  )
}
