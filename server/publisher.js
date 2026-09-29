import twitterText from 'twitter-text';
export function composePosts(article, quote) {
  const linkedin = `${article.title}\n\nAccording to ${article.sourceName}:\n“${quote}”\n\nRead the original announcement: ${article.url}\n\n#AI #ArtificialIntelligence`;
  let x = `${article.sourceName}: ${article.title}\n\n${article.url}`;
  if (!twitterText.parseTweet(x).valid) {
    const chars = [...article.title];
    while (
      chars.length &&
      !twitterText.parseTweet(`${article.sourceName}: ${chars.join('')}…\n\n${article.url}`).valid
    )
      chars.pop();
    x = `${article.sourceName}: ${chars.join('')}…\n\n${article.url}`;
  }
  return { linkedin, x };
}
export function validatePosts(posts, platforms) {
  if (platforms.includes('x') && !twitterText.parseTweet(posts.x || '').valid)
    throw new Error('X post must fit its weighted 280-character limit.');
  if (
    platforms.includes('linkedin') &&
    (!posts.linkedin?.trim() || [...posts.linkedin].length > 3000)
  )
    throw new Error('LinkedIn post must contain 1–3,000 characters.');
}
export class PublishError extends Error {
  constructor(message, uncertain = false) {
    super(message);
    this.uncertain = uncertain;
  }
}
export async function publishPost(platform, text, credentials, fetcher = fetch) {
  const linkedin = platform === 'linkedin';
  const token = linkedin ? credentials.linkedinToken : credentials.xToken;
  if (!token || (linkedin && !credentials.linkedinAuthor))
    throw new PublishError(`Connect ${linkedin ? 'LinkedIn' : 'X'} in Settings first.`);
  const url = linkedin ? 'https://api.linkedin.com/rest/posts' : 'https://api.x.com/2/tweets';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (linkedin)
    Object.assign(headers, {
      'LinkedIn-Version': credentials.linkedinVersion || '202603',
      'X-Restli-Protocol-Version': '2.0.0',
    });
  const body = linkedin
    ? {
        author: credentials.linkedinAuthor,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }
    : { text };
  let response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
      redirect: 'error',
    });
  } catch {
    throw new PublishError(
      'No definite response. Check your social account before retrying to avoid a duplicate.',
      true,
    );
  }
  if (!response.ok) {
    const uncertain = response.status >= 500 || response.status === 408;
    throw new PublishError(
      `Platform returned HTTP ${response.status}. ${response.status === 401 ? 'Reconnect with a fresh user access token.' : response.status === 403 ? 'Check account permissions and API access.' : response.status === 429 ? 'Rate limit reached. Try later.' : uncertain ? 'Check your account before retrying.' : 'Check API permissions, credits, and account settings.'}`,
      uncertain,
    );
  }
  let id;
  try {
    id = linkedin ? response.headers.get('x-restli-id') : (await response.json()).data?.id;
  } catch {}
  if (!id)
    throw new PublishError(
      'Platform accepted the request but returned no post ID. Check your account before retrying.',
      true,
    );
  return id;
}
