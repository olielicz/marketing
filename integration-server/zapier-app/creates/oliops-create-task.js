const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/oliops/create_task`,
    method: 'POST',
    body: {
      title: bundle.inputData.title,
      description: bundle.inputData.description,
      dueDate: bundle.inputData.dueDate,
      assignee: bundle.inputData.assignee
    }
  });
  return response.data.task;
};

module.exports = {
  key: 'oliops_create_task',
  noun: 'Task',
  display: { label: 'Create Task (OliOps)', description: 'Creates a new task in OliOps.' },
  operation: {
    inputFields: [
      { key: 'title', label: 'Title', type: 'string', required: true },
      { key: 'description', label: 'Description', type: 'text', required: false },
      { key: 'dueDate', label: 'Due Date', type: 'datetime', required: false },
      { key: 'assignee', label: 'Assignee', type: 'string', required: false }
    ],
    perform,
    sample: { id: 'sample-task-id', title: 'Follow up with lead', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' }
  }
};
