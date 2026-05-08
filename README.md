This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## WhatsApp AI Reply Flow

Agar user tidak perlu memasukkan OpenAI token di popup extension, project ini sekarang memakai proxy server kecil:

1. Extension membaca chat aktif dari WhatsApp Web.
2. Extension mengirim snapshot chat ke proxy endpoint.
3. Proxy yang menyimpan `OPENAI_API_KEY` memanggil OpenAI Responses API.
4. Proxy mengembalikan 3 saran balasan ke popup.

OpenAI sendiri menyarankan API key tidak diekspos di kode client-side/browser apps.

### Menjalankan proxy

1. Buat file `.env` di root project dengan isi seperti ini:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
PORT=9898
PLASMO_PUBLIC_OPENAI_PROXY_URL=http://127.0.0.1:9898/reply-suggestions
```

Kamu juga bisa mulai dari file [`.env.example`](</d:/Website JS/sg-extension/.env.example>).

2. Jalankan proxy:

```powershell
npm run proxy
```

Kalau muncul error `EADDRINUSE`, artinya port yang dipakai proxy sedang dipakai proses lain. Kamu bisa:

```powershell
Get-NetTCPConnection -LocalPort 9898
Stop-Process -Id <PID>
```

Atau ganti port di file `.env`, misalnya:

```env
PORT=9999
```

Default endpoint proxy:

```text
http://127.0.0.1:9898/reply-suggestions
```

Health check:

```text
http://127.0.0.1:9898/
http://127.0.0.1:9898/health
```

Kalau dibuka langsung di browser ke `/reply-suggestions`, proxy akan kasih info bahwa endpoint itu memang harus dipanggil dengan method `POST`.

Kalau mau ganti endpoint dari sisi extension, set env ini saat build/dev:

```powershell
$env:PLASMO_PUBLIC_OPENAI_PROXY_URL="https://domain-kamu/reply-suggestions"
```

Catatan:

- File `.env` otomatis dibaca oleh [server/openai-proxy.mjs](</d:/Website JS/sg-extension/server/openai-proxy.mjs>) saat startup.
- File `.env` sudah dimasukkan ke [`.gitignore`](</d:/Website JS/sg-extension/.gitignore>) supaya key tidak ikut ter-commit.

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
