import axios, { AxiosError, type AxiosAdapter, type AxiosInstance, type AxiosResponse } from "axios";

/** Imported console compatibility transport. It never performs network I/O. */
export const CONSOLE_TOKEN_FLAG = "__isConsoleToken" as const;
const unavailableMessage = "이 기능은 주루마블 서버에 아직 연결되지 않았습니다.";

function pathOf(config: Parameters<AxiosAdapter>[0]): string {
  try { return new URL(config.url ?? "/", "http://console.invalid").pathname; }
  catch { return "/"; }
}

const inertAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? "get").toLowerCase();
  const path = pathOf(config);
  // These two original helpers intentionally interpret 404 as an empty state.
  // No credential, session, or token is accepted by this response.
  const emptyResource = method === "get" &&
    (path === "/song-live/sessions/active" || path === "/song-requests/now-playing");
  const status = emptyResource ? 404 : 501;
  const statusText = emptyResource ? "Not Found" : "Not Implemented";
  throw new AxiosError(unavailableMessage, "ERR_ROGIMARBLE_UNAVAILABLE", config, undefined, {
    data: { code: "unsupported_imported_console_request", message: unavailableMessage },
    status, statusText, headers: { "x-rogimarble-adapter": "inert" }, config,
  } satisfies AxiosResponse);
};

function createClient(): AxiosInstance {
  return axios.create({ adapter: inertAdapter, timeout: 1_000, headers: { "Content-Type": "application/json" } });
}

export const apiClient = createClient();
export const apiV2Client = createClient();

/** Preserves the imported public API; no refresh/cookie interceptor is needed. */
export function attachResponseInterceptor(_instance: AxiosInstance): void {}
