## This app's code

© 2026 Seongsu Kim (passion leader). All rights reserved. The code is public so
people can see how it was made, but being public doesn't make it free to reuse:
you may read it and run it to see how it works, but not copy it into another
project, adapt it, or have an AI assistant reproduce it, without the author's
permission. The full terms are in the repository's
[LICENSE](https://github.com/passionleader/ANU-Crossing/blob/main/LICENSE).

## Code libraries

| Library | What it does here | Licence |
| --- | --- | --- |
| [Three.js](https://threejs.org) 0.186 | the 3D campus, glTF and HDR loaders, the sky | MIT |
| [LiveKit client](https://github.com/livekit/client-sdk-js) 2.23 | voice and screen sharing in the browser | Apache 2.0 |
| [Hono](https://hono.dev) 4.13 and [@hono/node-server](https://github.com/honojs/node-server) 2.1 | the web server | MIT |
| [ws](https://github.com/websockets/ws) 8.22 | real-time WebSockets | MIT |
| [marked](https://marked.js.org) 18.1 | Markdown in posts and on this page | MIT |
| [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3) (S3, SES, Bedrock Runtime) | files, sign-up mail, the AI assistants | Apache 2.0 |
| [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) 1.1 | the AI assistants without AWS (optional) | Apache 2.0 |
| [Node.js](https://nodejs.org) 24 (including `node:sqlite`, which is SQLite) | runs the server, stores the data | MIT (SQLite is public domain) |

Built with [Vite](https://vite.dev) and [TypeScript](https://www.typescriptlang.org)
(MIT and Apache 2.0), which don't ship in the app.

## Assets, music and map data
