const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.apiBaseUrl}/api/webhooks/v1/oliexplore/publish_post`,
    method: 'POST',
    body: {
      platforms: bundle.inputData.platforms ? bundle.inputData.platforms.split(',').map(p => p.trim()) : [],
      content: bundle.inputData.content,
      hashtags: bundle.inputData.hashtags ? bundle.inputData.hashtags.split(',').map(h => h.trim()) : [],
      mediaUrl: bundle.inputData.mediaUrl
    }
  });
  return response.data.post;
};

module.exports = {
  key: 'oliexplore_publish_post',
  noun: 'Post',
  display: { label: 'Publish Post (OliExplore)', description: 'Publishes a post to one or more social platforms.' },
  operation: {
    inputFields: [
      { key: 'platforms', label: 'Platforms (comma-separated)', type: 'string', required: true, helpText: 'e.g. twitter,linkedin,facebook' },
      { key: 'content', label: 'Content', type: 'text', required: true },
      { key: 'hashtags', label: 'Hashtags (comma-separated)', type: 'string', required: false },
      { key: 'mediaUrl', label: 'Media URL', type: 'string', required: false }
    ],
    perform,
    sample: { id: 'sample-post-id', platforms: ['twitter'], status: 'publishing' }
  }
};
