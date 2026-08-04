const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/oliflow/trigger_workflow`,
    method: 'POST',
    body: { workflowId: bundle.inputData.workflowId, triggerData: bundle.inputData.triggerData }
  });
  return response.data.execution;
};

module.exports = {
  key: 'oliflow_trigger_workflow',
  noun: 'Workflow Execution',
  display: { label: 'Trigger Workflow (OliFlow)', description: 'Queues an OliFlow workflow for execution.' },
  operation: {
    inputFields: [
      { key: 'workflowId', label: 'Workflow ID', type: 'string', required: true },
      { key: 'triggerData', label: 'Trigger Data (JSON)', type: 'text', required: false }
    ],
    perform,
    sample: { id: 'sample-execution-id', workflowId: 'wf_123', status: 'queued' }
  }
};
