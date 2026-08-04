const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/olisalestrack/record_sale`,
    method: 'POST',
    body: {
      amount: bundle.inputData.amount,
      productId: bundle.inputData.productId,
      customerId: bundle.inputData.customerId,
      currency: bundle.inputData.currency || 'USD'
    }
  });
  return response.data.sale;
};

module.exports = {
  key: 'olisalestrack_record_sale',
  noun: 'Sale',
  display: { label: 'Record Sale (OliSalesTrack)', description: 'Records a new sale transaction.' },
  operation: {
    inputFields: [
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'productId', label: 'Product ID', type: 'string', required: true },
      { key: 'customerId', label: 'Customer ID', type: 'string', required: false },
      { key: 'currency', label: 'Currency', type: 'string', required: false, default: 'USD' }
    ],
    perform,
    sample: { id: 'sample-sale-id', amount: 99.99, currency: 'USD', productId: 'prod_123', status: 'recorded' }
  }
};
