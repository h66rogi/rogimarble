import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";

const adapter: AxiosAdapter = async (config) => {
  throw new AxiosError("Imported overlay transport is unavailable", "ERR_ROGIMARBLE_UNAVAILABLE", config, undefined, { data: { code: "unsupported_imported_overlay_request" }, status: 501, statusText: "Not Implemented", headers: {}, config } satisfies AxiosResponse);
};

export const apiClient = axios.create({ adapter, timeout: 1000, headers: { "Content-Type": "application/json" } });
