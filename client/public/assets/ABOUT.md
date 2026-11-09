## About ANU Crossing

Made by passion leader ([GitHub](https://github.com/passionleader)) as the final
project of COMP8020 Agentic Coding Studio at the Australian National University
(Semester 2, 2026). An unofficial student project, not an ANU service.
[The code is on GitHub](https://github.com/passionleader/ANU-Crossing).

I planned it, photographed and drew the campus, chose the music, set up AWS and
tested it live on my own phone. The code was written with several Claude Code
sessions working together. The course provided the first hosting, the
repository and the Claude Code credits it was built with.

## Where it runs

This copy runs on Render's free plan (so the first visit can take a minute, and
accounts and posts reset when the server restarts), with voice and screen
sharing through LiveKit Cloud. Files, sign-up mail and the AI campus assistants
use the author's own AWS account: S3, SES and Amazon Bedrock (Claude Haiku 4.5
and Amazon Nova 2 Lite). The version submitted for the course ran on Fly.io,
with voice on the author's own EC2 server.

## Made with

Three.js for the 3D campus, Hono and Node's built-in SQLite on the server,
WebSockets for everyone moving in real time, LiveKit for voice, and Claude Code
(Anthropic) to write it. Music and some textures were generated with Google
Gemini. The library licences are on the Licences tab.

{{README}}
