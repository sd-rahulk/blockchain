let csrf = "";
export async function api(path, options = {}) {
  const { method = "GET", body, signal } = options;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    signal: signal || AbortSignal.timeout(15000),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  if (data.csrf) csrf = data.csrf;
  return data;
}
