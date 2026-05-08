import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const envFilePath = path.join(repoRoot, ".env")

const isPlaceholderEnvValue = (value) => {
  const normalizedValue = String(value || "").trim()

  return [
    "",
    "API_KEY_KAMU",
    "OPENAI_API_KEY_KAMU",
    "YOUR_OPENAI_API_KEY",
    "test-key"
  ].includes(normalizedValue)
}

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return
  }

  const fileContent = fs.readFileSync(filePath, "utf8")
  const lines = fileContent.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf("=")

    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "")

    if (!process.env[key] || isPlaceholderEnvValue(process.env[key])) {
      process.env[key] = normalizedValue
    }
  }
}

loadEnvFile(envFilePath)

const port = Number.parseInt(process.env.PORT || "8787", 10)
const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini"

if (!openaiApiKey) {
  console.error("OPENAI_API_KEY belum di-set.")
  console.error("Simpan key di file .env atau set environment variable terlebih dulu.")
  process.exit(1)
}

const buildSuggestionPrompt = (chatData) => {
  const transcript = (chatData?.messages || [])
    .slice(-12)
    .map((message) => {
      const timestamp = message?.timestampLabel ? `[${message.timestampLabel}] ` : ""
      const author = message?.author || "Tanpa nama"
      const text = message?.text || ""

      return `${timestamp}${author}: ${text}`
    })
    .join("\n")

  return [
    `Judul chat: ${chatData?.chatTitle || "-"}`,
    chatData?.chatSubtitle ? `Info chat: ${chatData.chatSubtitle}` : "",
    "",
    "Pesan terbaru:",
    transcript
  ]
    .filter(Boolean)
    .join("\n")
}

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : []

  const contentTexts = outputItems
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === "output_text" && typeof item?.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)

  return contentTexts.join("\n").trim()
}

const parseSuggestions = (text) => {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\[SUGGESTION\]\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 3)
}

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8"
  })

  response.end(JSON.stringify(payload))
}

const server = http.createServer(async (request, response) => {
  console.log(
    `[proxy] ${request.method} ${request.url} origin=${request.headers.origin || "-"}`
  )

  if (request.method === "GET" && (request.url === "/" || request.url === "/health")) {
    sendJson(response, 200, {
      endpoint: `http://127.0.0.1:${port}/reply-suggestions`,
      method: "POST",
      model: openaiModel,
      ok: true,
      status: "Proxy aktif"
    })
    return
  }

  if (request.method === "GET" && request.url === "/reply-suggestions") {
    sendJson(response, 200, {
      endpoint: "/reply-suggestions",
      message: "Gunakan method POST ke endpoint ini dengan body JSON berisi chatData.",
      ok: true
    })
    return
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 200, {
      ok: true
    })
    return
  }

  if (request.method !== "POST" || request.url !== "/reply-suggestions") {
    sendJson(response, 404, {
      error: "Route tidak ditemukan."
    })
    return
  }

  try {
    const chunks = []

    for await (const chunk of request) {
      chunks.push(chunk)
    }

    const rawBody = Buffer.concat(chunks).toString("utf8")
    const body = rawBody ? JSON.parse(rawBody) : {}
    const chatData = body?.chatData

    if (!chatData || !Array.isArray(chatData?.messages) || chatData.messages.length === 0) {
      sendJson(response, 400, {
        error: "chatData.messages wajib ada dan tidak boleh kosong."
      })
      return
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        input: buildSuggestionPrompt(chatData),
        instructions:
          "Kamu membantu menyusun saran balasan WhatsApp. Berikan tepat 3 opsi balasan singkat, natural, relevan, dan sesuai bahasa serta tone percakapan. Jangan menambahkan fakta baru. Setiap opsi harus berada di baris terpisah dan diawali persis dengan '[SUGGESTION] '. Jangan tambahkan teks lain selain 3 baris itu.",
        max_output_tokens: 220,
        model: openaiModel
      }),
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    })

    const payload = await openaiResponse.json()

    if (!openaiResponse.ok) {
      sendJson(response, openaiResponse.status, {
        error:
          payload?.error?.message || "OpenAI gagal memproses permintaan saran jawaban."
      })
      return
    }

    const outputText = extractResponseText(payload)
    const suggestions = parseSuggestions(outputText)

    if (suggestions.length === 0) {
      sendJson(response, 502, {
        error: "OpenAI tidak mengembalikan saran jawaban yang valid."
      })
      return
    }

    sendJson(response, 200, {
      model: openaiModel,
      suggestions
    })
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Terjadi kendala internal pada proxy OpenAI."
    })
  }
})

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${port} sedang dipakai proses lain.`)
    console.error("Matikan proses proxy/node lama atau ganti nilai PORT di file .env.")
    console.error("Contoh PowerShell untuk cek proses: Get-NetTCPConnection -LocalPort 8787")
    console.error("Contoh PowerShell untuk matikan proses: Stop-Process -Id <PID>")
    process.exit(1)
  }

  console.error("Gagal menjalankan proxy:", error)
  process.exit(1)
})

server.listen(port, () => {
  console.log(`OpenAI proxy aktif di http://127.0.0.1:${port}/reply-suggestions`)
  console.log(`Model default: ${openaiModel}`)
  console.log(`Sumber konfigurasi .env: ${fs.existsSync(envFilePath) ? envFilePath : "tidak ada"}`)
})
