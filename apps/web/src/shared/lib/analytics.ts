/** Local no-op analytics boundary for the imported console. */
export const analytics = {
  capture(_event: string, _properties?: Record<string, unknown>): void {},
};
