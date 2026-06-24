# Sub2API Rate Checker

Desktop rate comparison console for users who manage many relay stations.

It currently supports:

- sub2api sites
- New API sites
- Per-site browser login windows and token capture
- Batch querying all saved sites
- Group dropdown/search similar to sub2api
- Full-site price comparison sorted by effective group multiplier
- API key summaries and sub2api channel monitor summaries

## Why

Relay stations often expose many groups, and each group may have a different multiplier. This app keeps those sites in one local desktop console so you can quickly answer:

- Which site is cheapest for a group?
- Which groups are available on a site?
- Which API keys are bound to each group?
- Which sub2api channel monitors are healthy?

## Token Notes

Tokens are saved only on your local machine in Electron's `userData` directory.

For sub2api:

- Paste `auth_token` / `refresh_token`, or
- Open the browser login window and let the app capture `auth_token` from localStorage after you log in.

For New API:

- The public `/api/pricing` endpoint can be used for group pricing without a token when the site exposes it.
- To query `/api/token/`, paste a New API user AccessToken.
- If the site requires `New-Api-User`, fill in the optional `New API User ID` field.
- Browser token capture is best-effort because New API deployments may store login state under different localStorage keys.

## Development

```bash
npm install
npm run check
npm start
```

## Build

```bash
npm run dist
```

For a fast Windows unpacked build during development:

```bash
npx electron-builder --win dir --publish never --config.directories.output=dist-newapi
```

## Security

- No tokens or passwords are committed to this repository.
- No token values are logged by the app.
- Site credentials are stored locally in Electron `userData`.
- If you publish your own fork, do not commit generated `dist*` folders or local configuration.

## License

MIT
