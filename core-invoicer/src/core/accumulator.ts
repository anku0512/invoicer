export class Accumulator {
  invoices: Record<string,string>[] = [];
  lines: Record<string,string>[] = [];
  addInvoice(inv: Record<string,string>) { this.invoices.push(inv); }
  addLines(items: Record<string,string>[]) { this.lines.push(...items); }
  clear() { this.invoices = []; this.lines = []; }
}
