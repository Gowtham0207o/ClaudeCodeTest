# Archived

This file previously claimed "all 6 job sources working" — in reality only RemoteOK
was live and the rest returned demo/fallback data. It also contained **secrets in
plaintext**, now removed.

The honest, current state and the live source list are in
**[`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)**.

> **Action required:** rotate any keys that ever appeared in this file (Trigger.dev,
> Firebase). Keep secrets in `.env.local` only.
