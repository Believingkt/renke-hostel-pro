export const sent: any[] = [];
export class Resend {
  emails = { send: async (m: any) => { sent.push(m); return { data: { id: "mail-1" }, error: null }; } };
  constructor(_k?: string) {}
}
