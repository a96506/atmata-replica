export const DOC_LINE =
  "id,product_id,description,qty,unit_price,tax_code_id,discount,qty_received,qty_delivered,qty_invoiced,line_order";

export const MASTER_SELECTS = {
  companies: "id,row_version,name,tax_profile,base_currency,vat_number",
  branches: "id,company_id,name",
  customers: "id,name,email,vat_number,credit_limit,exposure,payment_status,credit_score",
  suppliers:
    "id,name,email,vat_number,bank_account,payment_term_id,wht_applicable,wht_rate",
  products:
    "id,sku,name,uom,tax_code_id,costing_method,lot_tracked,purchasable,sellable,default_purchase_price,default_sale_price,reorder_point,abc_class",
  warehouses: "id,company_id,code,name",
  locations: "id,warehouse_id,code,name",
  tax_codes: "id,jurisdiction,code,name_en,name_ar,rate,is_input,is_output",
  payment_terms: "id,code,name_en,name_ar,net_days",
  bank_accounts: "id,company_id,name,iban,currency,account_id",
  fiscal_periods: "id,company_id,year,month,start,end,status",
  fx_rates:
    "id,base_currency,quote_currency,rate,rate_date,source",
  approval_rules:
    "id,doc_type,min_amount,max_amount,approver_roles,sequence,active",
  price_lists: "id,name,currency,active,starts_on,ends_on",
  document_sequences: "id,doc_type,prefix,year,padding,next_number",
} as const;

export const P2P_SELECTS = {
  purchaseRequisitions:
    `id,row_version,number,company_id,requested_by,date,needed_by,state,notes,lines:purchase_requisition_lines(${DOC_LINE})`,
  purchaseOrders:
    `id,row_version,number,company_id,supplier_id,pr_id,date,expected_date,currency,payment_term_id,warehouse_id,state,subtotal,tax_total,total,notes,lines:purchase_order_lines(${DOC_LINE})`,
  goodsReceipts:
    "id,row_version,number,company_id,po_id,supplier_id,warehouse_id,date,state,notes,lines:goods_receipt_lines(id,po_line_id,product_id,description,qty,unit_price,tax_code_id,discount,qty_received,lot_number,line_order)",
  vendorBills:
    `id,row_version,number,company_id,supplier_id,po_id,grn_id,invoice_number,date,due_date,currency,state,subtotal,tax_total,total,paid,three_way_match,discrepancy_reason,source_ocr_job_id,lines:vendor_bill_lines(po_line_id,grn_line_id,${DOC_LINE})`,
  vendorPayments:
    "id,row_version,number,company_id,supplier_id,bank_account_id,date,currency,state,amount,method,allocations:vendor_payment_allocations(id,bill_id,amount)",
} as const;

export const RFQ_SELECT =
  "id,row_version,number,company_id,date,expected_quote_by,state,awarded_vendor_id,awarded_quote_id,award_po_id,awarded_at,awarded_by,notes,sources:rfq_sources(id,purchase_requisition_id),invited:rfq_invited_suppliers(id,supplier_id),lines:rfq_lines(id,product_id,description,qty,line_order,line_sources:rfq_line_sources(id,purchase_requisition_line_id)),quotes:rfq_quotes!rfq_quotes_company_id_rfq_id_fkey(id,vendor_id,received_date,currency,total,valid_until,line_quotes:rfq_quote_lines(id,rfq_line_id,unit_price,lead_time_days,notes,line_order))";

export const Q2C_SELECTS = {
  opportunities:
    "id,number,customer_id,title,stage,value,probability,next_action,days_idle",
  quotes:
    `id,row_version,number,company_id,customer_id,opportunity_id,date,valid_until,currency,state,subtotal,tax_total,total,notes,lines:quote_lines(${DOC_LINE})`,
  salesOrders:
    `id,row_version,number,company_id,customer_id,quote_id,date,expected_delivery_date,currency,warehouse_id,state,blocked_reason,exceptional,subtotal,tax_total,total,lines:sales_order_lines(${DOC_LINE})`,
  deliveryNotes:
    "id,row_version,number,company_id,so_id,customer_id,warehouse_id,date,state,lines:delivery_note_lines(id,so_line_id,product_id,description,qty,unit_price,tax_code_id,discount,qty_delivered,line_order)",
  customerInvoices:
    `id,row_version,number,company_id,customer_id,so_id,dn_id,date,due_date,currency,state,subtotal,tax_total,total,paid,lines:customer_invoice_lines(so_line_id,dn_line_id,${DOC_LINE})`,
  customerReceipts:
    "id,row_version,number,company_id,customer_id,bank_account_id,date,currency,state,amount,method,allocations:customer_receipt_allocations(id,invoice_id,amount)",
} as const;

export const RETURN_SELECTS = {
  vendorReturns:
    "id,row_version,number,company_id,grn_id,supplier_id,warehouse_id,date,state,debit_note_id,notes,lines:vendor_return_lines(id,grn_line_id,product_id,description,qty,unit_price,tax_code_id,reason_code,notes,lot_number,line_order)",
  debitNotes:
    "id,row_version,number,company_id,supplier_id,vendor_return_id,bill_id,date,currency,state,subtotal,tax_total,total,settled",
  customerReturns:
    "id,row_version,number,company_id,dn_id,customer_id,warehouse_id,date,state,credit_note_id,notes,lines:customer_return_lines(id,dn_line_id,product_id,description,qty,unit_price,tax_code_id,reason_code,notes,lot_number,line_order)",
  creditNotes:
    "id,row_version,number,company_id,customer_id,customer_return_id,invoice_id,date,currency,state,subtotal,tax_total,total,applied",
} as const;

export const INVENTORY_SELECTS = {
  stockMoves:
    "id,number,date,product_id,warehouse_id,direction,qty,cost_per_unit,lot_number,source_type,source_id",
  internalTransfers:
    "id,row_version,number,company_id,from_warehouse_id,to_warehouse_id,date,state,notes,lines:internal_transfer_lines(id,product_id,qty,lot_number,line_order)",
  stockAdjustments:
    "id,row_version,number,company_id,date,state,approved_by,notes,lines:stock_adjustment_lines(id,product_id,warehouse_id,qty_delta,reason,line_order)",
} as const;

export const GL_SELECTS = {
  accounts: "id,code,name,type,parent",
  journalEntries:
    "id,row_version,number,company_id,date,currency,state,source_type,source_id,description,lines:journal_entry_lines(id,account_id,description,debit,credit,line_order)",
} as const;

export const INBOX_SELECTS = {
  notifications:
    "id,kind,title,body,doc_type,doc_id,read_at,created_at",
} as const;

export const RECON_SELECTS = {
  bankStatements:
    "id,number,bank_account_id,period_start,period_end,opening_balance,closing_balance,status,created_at,updated_at",
  suggestedMatches:
    "id,confidence,status,proposed_by,source_doc_type,source_doc_id,journal_entry_id,bank_statement_line_id,bank_statement_lines(id,reference,amount,description,line_number,bank_statement_id,status),journal_entries(id,number)",
} as const;

export const PERIOD_CLOSE_SELECTS = {
  runs: "id,fiscal_period_id,status,started_at,completed_at,created_at",
  tasks:
    "id,period_close_run_id,code,name,sequence,status,detail,completed_at,created_at",
} as const;
