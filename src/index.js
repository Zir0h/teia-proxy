async function getProfileDetails(profileAddress) {
  const response = await fetch(HICDEX_API, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query GetProfileInfos {
            holder: holder_by_pk(address: ${profileAddress}) {
                metadata(path: "identicon")
                address
                name
                description
            }
        }
      `,
    }),
  });

  const json = await response.json();
  return json && json.data && json.data.holder;
}

async function getTokenDetails(tokenId) {
  const response = await fetch(HICDEX_API, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query GetTokenInfos {
            token: token_by_pk(id: ${tokenId}) {
                id
                title
                description
                display_uri
                artifact_uri
            }
        }
      `,
    }),
  });

  const json = await response.json();
  return json && json.data && json.data.token;
}

function clean(str) {
  return str.replaceAll('"', '');
}

function injectOpenGraphTags(body, info, originalUrl) {
  let newBody = body;

  // remove existing og tags
  newBody = newBody.replace(/<meta.*?property="og.*?\/>/gm, '');
  newBody = newBody.replace(/<meta.*?name="twitter.*?\/>/gm, '');

  const title = clean(`${info.title ? info.title : info.name}`);
  const description = clean(info.description);
  const image = clean(`${info.display_uri ? info.display_uri : info.metadata}`.replace('ipfs://', IPFS_GATEWAY));
  const image_backup = clean(`${info.artifact_uri ? info.artifact_uri : ""}`.replace('ipfs://', IPFS_GATEWAY));
  const url = `${originalUrl.protocol}//${originalUrl.hostname}/${info.title ? "objkt" : "tz"}/${info.id ? info.id : info.address}`;

  const openGraphTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image ? image : image_backup}" />
    <meta property="og:url" content="${url}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:creator" content="@TeiaCommunity" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image ? image : image_backup}" />
  `;

  return newBody.replace('<head>', `<head>${openGraphTags}`);
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  url.hostname = TARGET_HOSTNAME;

  try {
    const profilePageMatch = url.pathname.match(/\/tz\/(tz[a-zA-Z0-9]{34})/);

    if (profilePageMatch) {
      const address = profilePageMatch[1];

      // TODO: set the correct headers.
      const teiaRequest = new Request(request, { headers: { 'Cache-Control': 'no-cache' } });
      const [response, profile] = await Promise.all([fetch(url.toString(), teiaRequest), getProfileDetails(address)]);

      if (!profile) {
        throw new Error(`could not fetch profile information ${address}`);
      }

      const body = await response.text();

      return new Response(injectOpenGraphTags(body, profile, new URL(request.url)), response);
    } else {
      const detailPageMatch = url.pathname.match(/\/objkt\/([0-9]+)/);

      if (detailPageMatch) {
        const tokenId = detailPageMatch[1];

        // TODO: set the correct headers.
        const teiaRequest = new Request(request, { headers: { 'Cache-Control': 'no-cache' } });
        const [response, token] = await Promise.all([fetch(url.toString(), teiaRequest), getTokenDetails(tokenId)]);

        if (!token) {
          throw new Error(`could not fetch token ${tokenId}`);
        }

        const body = await response.text();

        return new Response(injectOpenGraphTags(body, token, new URL(request.url)), response);
      }
    }
  } catch (err) {
    console.log('failed to process token metadata', err);
  }

  return await fetch(url.toString(), request);
}
