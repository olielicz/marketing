const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/olicommerce/record_cart_recovery`,
    method: 'POST',
    body: {
      cartId: bundle.inputData.cartId,
      email: bundle.inputData.email,
      cartValue: bundle.inputData.cartValue
    }
  });
  return response.data.recovery;
};

module.exports = {
  key: 'olicommerce_record_cart_recovery',
  noun: 'Cart Recovery',
  display: { label: 'Record Cart Recovery (OliCommerce)', description: 'Initiates an abandoned cart recovery flow.' },
  operation: {
    inputFields: [
      { key: 'cartId', label: 'Cart ID', type: 'string', required: true },
      { key: 'email', label: 'Customer Email', type: 'string', required: true },
      { key: 'cartValue', label: 'Cart Value', type: 'number', required: false }
    ],
    perform,
    sample: { id: 'sample-recovery-id', cartId: 'cart_123', email: 'buyer@example.com', status: 'initiated' }
  }
};
