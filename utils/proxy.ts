const DEFAULT_PROXY_URL = "http://127.0.0.1:9898/reply-suggestions"

export const getConfiguredProxyUrl = () => DEFAULT_PROXY_URL

export const getProxyCandidates = (url: string) => {
  const normalizedUrl = (url || DEFAULT_PROXY_URL).trim()
  const candidates = [normalizedUrl]

  if (normalizedUrl.includes("://localhost")) {
    candidates.push(normalizedUrl.replace("://localhost", "://127.0.0.1"))
  } else if (normalizedUrl.includes("://127.0.0.1")) {
    candidates.push(normalizedUrl.replace("://127.0.0.1", "://localhost"))
  }

  return Array.from(new Set(candidates.filter(Boolean)))
}
