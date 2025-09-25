import Ajv from 'ajv';

export const invoiceSchema = {
  type: 'object',
  // Align with n8n SOP: enforce required while allowing flexible types
  required: [
    'invoice_key',
    'supplier_name',
    'supplier_gstin',
    'buyer_name',
    'buyer_gstin',
    'invoice_number',
    'invoice_date',
    'invoice_total',
  ],
  additionalProperties: true,
  properties: {
    invoice_key: { type: ['string','null'] },
    supplier_name: { type: ['string','null'] },
    supplier_gstin: { type: ['string','null'] },
    buyer_name: { type: ['string','null'] },
    buyer_gstin: { type: ['string','null'] },
    invoice_number: { type: ['string','null'] },
    invoice_date: { type: ['string','null'] },
    due_date: { type: ['string','null'] },
    payment_terms: { type: ['string','null'] },
    invoice_month: { type: ['string','null'] },
    place_of_supply_state: { type: ['string','null'] },
    place_of_supply_code: { type: ['string','null'] },
    currency: { type: ['string','null'] },
    taxable_value: { type: ['string','null','number'] },
    cgst_rate_pct: { type: ['string','null','number'] },
    cgst_amount: { type: ['string','null','number'] },
    sgst_rate_pct: { type: ['string','null','number'] },
    sgst_amount: { type: ['string','null','number'] },
    igst_rate_pct: { type: ['string','null','number'] },
    igst_amount: { type: ['string','null','number'] },
    rounding: { type: ['string','null','number'] },
    invoice_total: { type: ['string','null','number'] },
    balance_due: { type: ['string','null','number'] },
    hsn_list: { type: ['string','null'] },
    line_items_json: { type: ['string','null'] },
    excel_mis_link: { type: ['string','null'] },
    irn: { type: ['string','null'] },
    ack_no: { type: ['string','null'] },
    ack_date: { type: ['string','null'] },
    bank_beneficiary: { type: ['string','null'] },
    bank_name: { type: ['string','null'] },
    bank_account_last4: { type: ['string','null'] },
    bank_ifsc: { type: ['string','null'] },
    po_number: { type: ['string','null'] },
  },
};

export const lineItemSchema = {
  type: 'object',
  // Align with n8n SOP: enforce required while allowing flexible types
  required: [ 'invoice_key','invoice_number','description','line_no','line_amount' ],
  additionalProperties: true,
  properties: {
    line_key: { type: ['string','null'] },
    invoice_key: { type: ['string','null'] },
    invoice_number: { type: ['string','null'] },
    invoice_date: { type: ['string','null'] },
    supplier_name: { type: ['string','null'] },
    description: { type: ['string','null'] },
    hsn_sac: { type: ['string','null'] },
    line_no: { type: ['string','null','number'] },
    quantity: { type: ['string','null','number'] },
    unit_price: { type: ['string','null','number'] },
    line_amount: { type: ['string','null','number'] },
    cgst_rate_pct: { type: ['string','null','number'] },
    cgst_amount: { type: ['string','null','number'] },
    sgst_rate_pct: { type: ['string','null','number'] },
    sgst_amount: { type: ['string','null','number'] },
    igst_rate_pct: { type: ['string','null','number'] },
    igst_amount: { type: ['string','null','number'] },
    po_number: { type: ['string','null'] },
  },
};

export const outputSchema = {
  type: 'object',
  required: ['invoice','line_items'],
  properties: {
    invoice: invoiceSchema,
    line_items: { type: 'array', items: lineItemSchema },
  },
};

export const ajv = new Ajv({ allErrors: true, strict: false });
export const validateOutput = ajv.compile(outputSchema as any);
