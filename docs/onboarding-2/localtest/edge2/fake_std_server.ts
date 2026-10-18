export function serve(h: (r: Request) => Promise<Response>) {
  (globalThis as any).__capture(h);
}
