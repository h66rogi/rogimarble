import { resolveRedirectTarget } from "./safe-redirect";
import { getDefaultBase } from "./service-routes";

export type AuthSearchParams = Record<
  string,
  string | string[] | undefined
>;

const RETURN_PARAM_KEYS = [
  "from",
  "returnTo",
  "redirect",
  "to",
  "next",
] as const;

function appendSearchParam(
  target: URLSearchParams,
  key: string,
  value: string | string[]
) {
  if (Array.isArray(value)) {
    value.forEach((item) => target.append(key, item));
    return;
  }
  target.append(key, value);
}

function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function buildIdAuthRedirectUrl(
  authPath: string,
  searchParams: AuthSearchParams
): string {
  const portalOrigin = getDefaultBase("portal");
  const targetUrl = new URL(authPath, getDefaultBase("id"));

  let rawReturnTo: string | null = null;
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (RETURN_PARAM_KEYS.includes(key as (typeof RETURN_PARAM_KEYS)[number])) {
      if (rawReturnTo === null) rawReturnTo = getFirstValue(value);
      continue;
    }
    appendSearchParam(targetUrl.searchParams, key, value);
  }

  const returnTarget = resolveRedirectTarget(rawReturnTo, portalOrigin);
  const absoluteReturnTo =
    returnTarget.kind === "internal"
      ? new URL(returnTarget.path, portalOrigin).toString()
      : returnTarget.href;

  targetUrl.searchParams.set("from", absoluteReturnTo);
  if (!targetUrl.searchParams.has("service")) {
    targetUrl.searchParams.set("service", "meloming");
  }

  return targetUrl.toString();
}

/**
 * 인증 교환이 끝난 뒤 통합 ID가 onboarding 상태를 확인하도록 보내는 전용 URL.
 * 로그인 시작 URL의 `from`과 달리 완료 라우트는 `to`를 계약으로 사용한다.
 */
export function buildIdAuthCompletionUrl(
  rawReturnTo: string | null | undefined,
  options?: {
    service?: string;
    authMethod?: "password" | "email" | "google" | "apple";
    authFlow?: "login" | "signup";
    authEntry?: "onetap";
  }
): string {
  const portalOrigin = getDefaultBase("portal");
  const returnTarget = resolveRedirectTarget(rawReturnTo, portalOrigin);
  const absoluteReturnTo =
    returnTarget.kind === "internal"
      ? new URL(returnTarget.path, portalOrigin).toString()
      : returnTarget.href;
  const targetUrl = new URL("/auth/redirect", getDefaultBase("id"));
  targetUrl.searchParams.set("to", absoluteReturnTo);
  targetUrl.searchParams.set("service", options?.service ?? "meloming");
  if (options?.authMethod) {
    targetUrl.searchParams.set("authMethod", options.authMethod);
  }
  if (options?.authFlow) {
    targetUrl.searchParams.set("authFlow", options.authFlow);
  }
  if (options?.authEntry) {
    targetUrl.searchParams.set("authEntry", options.authEntry);
  }
  return targetUrl.toString();
}
