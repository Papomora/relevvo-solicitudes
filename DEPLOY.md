# Deploy — Portal de Solicitudes Relevvo

## 1. Crear base de datos en Neon.tech

1. Ir a https://neon.tech → crear cuenta gratuita
2. **New Project** → nombre: `relevvo-solicitudes`
3. Copiar el **Connection String** y pegarlo como `DATABASE_URL` en `.env.local`

---

## 2. Configurar variables locales

Edita `.env.local`:
- `DATABASE_URL` → string de Neon
- `NEXTAUTH_SECRET` → generá con `openssl rand -base64 32`
- `ADMIN_PASSWORD` → contraseña que vos elijas
- `PIN_ARU`, `PIN_CRUSSO`, etc. → PINs de 4 dígitos por cliente

---

## 3. Instalar y correr local

```bash
cd relevvo-solicitudes
npm install
npx prisma db push
npm run dev
# → http://localhost:3000/login       (clientes)
# → http://localhost:3000/admin/login (admin)
```

---

## 4. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: portal de solicitudes relevvo"
# Crear repo en github.com → copiar URL
git remote add origin https://github.com/TU_USUARIO/relevvo-solicitudes.git
git push -u origin main
```

---

## 5. Deploy en Vercel

1. Ir a https://vercel.com → **Add New Project**
2. Importar el repo `relevvo-solicitudes` de GitHub
3. Framework: **Next.js** (auto-detectado)
4. Agregar **Environment Variables** (todas las del `.env.local` excepto `NEXTAUTH_URL`):
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` → `https://solicitudes.relevvostudio.com`
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
   - `PIN_ARU`, `PIN_CRUSSO`, `PIN_GROI`, `PIN_MOLICIE`, `PIN_VERSLA`, `PIN_VISUALITY`
5. Click **Deploy**

---

## 6. Dominio personalizado

En Vercel → tu proyecto → **Settings → Domains**:
- Agregar: `solicitudes.relevvostudio.com`
- En tu DNS (donde tienes relevvostudio.com) agregar:
  ```
  CNAME  solicitudes  cname.vercel-dns.com
  ```

---

## 7. Correr migración en producción

Una sola vez, desde tu máquina con `DATABASE_URL` de producción:
```bash
npx prisma db push
```
