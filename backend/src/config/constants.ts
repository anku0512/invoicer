import { env } from './env';

export const REGEX = {
  driveFileId: /https:\/\/(?:drive|docs)\.google\.com(?:\/.*|)\/d\/([0-9a-zA-Z\-_]+)(?:\/.*|)/,
};

export const SHEETS = {
  source: { id: env.SOURCE_SHEET_ID, tab: env.SOURCE_SHEET_TAB, linkColumn: env.SOURCE_LINK_COLUMN },
  target: { id: env.TARGET_SHEET_ID, invoicesTab: env.TARGET_INVOICES_TAB, linesTab: env.TARGET_LINE_ITEMS_TAB },
};

export const INVOICE_HEADERS = [
  'invoice_key','supplier_name','supplier_gstin','buyer_name','buyer_gstin','invoice_number','invoice_date','due_date','payment_terms','invoice_month','place_of_supply_state','place_of_supply_code','currency','taxable_value','cgst_rate_pct','cgst_amount','sgst_rate_pct','sgst_amount','igst_rate_pct','igst_amount','rounding','invoice_total','balance_due','hsn_list','line_items_json','excel_mis_link','irn','ack_no','ack_date','bank_beneficiary','bank_name','bank_account_last4','bank_ifsc','po_number'
];

export const LINE_HEADERS = [
  'line_key','invoice_key','invoice_number','invoice_date','supplier_name','description','hsn_sac','line_no','quantity','unit_price','line_amount','cgst_rate_pct','cgst_amount','sgst_rate_pct','sgst_amount','igst_rate_pct','igst_amount','po_number'
];
